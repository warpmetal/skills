import type { CommandRunner } from "../run.js";

/**
 * Windows ACL inspection for the vault directory.
 *
 * `chmod` cannot express an ACL, so the POSIX mode check in `env doctor` proves
 * nothing on Windows - the platform where most agents run. This module reads the
 * real security descriptor instead of guessing.
 *
 * The descriptor is fetched as **SDDL**, which is locale-independent: a Spanish
 * or Japanese Windows writes the same `(A;ID;FR;;;WD)` an English one does. The
 * path is passed through the environment rather than interpolated into the
 * command string, so a path with quotes or spaces cannot become code.
 */
export type AclStatus = "ok" | "exposed" | "unknown";

export interface AclVerdict {
  readonly status: AclStatus;
  /** Trustees that give broad read access, as they appear in SDDL. */
  readonly trustees: readonly string[];
  readonly detail: string;
}

/**
 * The trustees that mean "readable beyond the owner".
 *
 * SDDL abbreviates well-known SIDs, and it uses the abbreviation by default:
 * `WD` is Everyone, `BU` is Users, `AU` is Authenticated Users. Both spellings
 * are listed because a descriptor may contain either.
 */
const WORLD_TRUSTEES: ReadonlySet<string> = new Set([
  "WD",
  "S-1-1-0",
  "BU",
  "S-1-5-32-545",
  "AU",
  "S-1-5-11",
]);

/**
 * ACE types that grant access.
 *
 * `D` (and its object/conditional spellings) *denies* access, which is the
 * opposite of exposure: hardened hosts carry `(D;CIID;DT;;;WD)` on directories
 * they create, and counting that as "readable by Everyone" would warn on a
 * machine that did the right thing. Audits and alarms grant nothing either.
 */
const ALLOW_ACE_TYPES: ReadonlySet<string> = new Set(["A", "OA", "XA"]);

/**
 * Extracts the broad-read trustees from an SDDL string.
 *
 * An ACE looks like `(A;ID;FR;;;WD)`: type, flags, rights, two object GUIDs,
 * then the trustee. Only allow ACEs are considered, and only the trustee field
 * is inspected, so a GUID that happens to contain `WD` cannot be mistaken for
 * one.
 */
export function findWorldAces(sddl: string): readonly string[] {
  const found = new Set<string>();
  for (const ace of sddl.match(/\([^)]*\)/g) ?? []) {
    const fields = ace.slice(1, -1).split(";");
    if (fields.length < 6) continue;
    if (!ALLOW_ACE_TYPES.has(fields[0]?.trim() ?? "")) continue;
    const trustee = fields[5]?.trim();
    if (trustee !== undefined && WORLD_TRUSTEES.has(trustee)) found.add(trustee);
  }
  return [...found];
}

/**
 * The environment the ACL probe needs.
 *
 * Windows PowerShell 5.1 autoloads `Microsoft.PowerShell.Security` - the module
 * that owns `Get-Acl` - from `PSModulePath`. A caller launched from PowerShell 7
 * (a `pwsh` shell, a CI step, most modern Windows terminals) hands that path
 * down with the PowerShell 7 module directories first, and 5.1 then fails the
 * autoload and exits non-zero: a healthy host would be reported as `unknown`.
 * The probe depends on 5.1 semantics and needs no other module, so pin 5.1's own
 * module directories for this one child instead of inheriting the caller's.
 */
function powershellEnv(targetPath: string): Record<string, string> {
  const systemRoot = process.env["SystemRoot"] ?? process.env["windir"] ?? "C:\\Windows";
  const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const modulePath = [
    `${systemRoot}\\system32\\WindowsPowerShell\\v1.0\\Modules`,
    `${programFiles}\\WindowsPowerShell\\Modules`,
  ].join(";");
  return { WARPMETAL_ACL_PATH: targetPath, PSModulePath: modulePath };
}

/**
 * Reads the security descriptor of one path.
 *
 * `unknown` is a first-class answer: a missing PowerShell, a refused call or an
 * unparsable answer must never be rounded up to `ok`, because that is exactly
 * the silence this check exists to remove. It also has to say *why*: an
 * unexplained `unknown` is indistinguishable from a flake in a CI log.
 */
export async function checkWindowsAcl(
  run: CommandRunner,
  targetPath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<AclVerdict> {
  if (platform !== "win32") {
    return { status: "unknown", trustees: [], detail: "not a Windows host" };
  }

  const result = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-Acl -LiteralPath $env:WARPMETAL_ACL_PATH).Sddl",
    ],
    { env: powershellEnv(targetPath) },
  );

  if (result.code === 127) {
    // Same rule as below: the verdict carries its reason, so a missing
    // interpreter is not filed as an unexplained `unknown`.
    const reason = result.stderr.replace(/\s+/g, " ").trim().slice(0, 200);
    return {
      status: "unknown",
      trustees: [],
      detail: `PowerShell is not available${reason.length > 0 ? `: ${reason}` : ""}`,
    };
  }
  const sddl = result.stdout.trim();
  if (result.code !== 0 || !sddl.includes("D:")) {
    // Carry the reason with the verdict: a bare `unknown` in a CI log cannot be
    // told apart from a transient failure, and it is usually one line of
    // PowerShell that names the real problem (a shadowed module, a refused
    // path). The text is bounded and holds no secret - a path and a diagnostic.
    const reason = result.stderr.replace(/\s+/g, " ").trim().slice(0, 200);
    return {
      status: "unknown",
      trustees: [],
      detail: `the security descriptor could not be read (exit ${String(result.code)})${reason.length > 0 ? `: ${reason}` : ""}`,
    };
  }

  const trustees = findWorldAces(sddl);
  return trustees.length === 0
    ? { status: "ok", trustees, detail: "no broad-read ACE" }
    : {
        status: "exposed",
        trustees,
        detail: `readable by ${trustees.join(", ")}`,
      };
}
