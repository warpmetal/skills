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
 * Extracts the broad-read trustees from an SDDL string.
 *
 * An ACE looks like `(A;ID;FR;;;WD)`: type, flags, rights, two object GUIDs,
 * then the trustee. Only the trustee field is inspected, so a GUID that happens
 * to contain `WD` cannot be mistaken for one.
 */
export function findWorldAces(sddl: string): readonly string[] {
  const found = new Set<string>();
  for (const ace of sddl.match(/\([^)]*\)/g) ?? []) {
    const fields = ace.slice(1, -1).split(";");
    if (fields.length < 6) continue;
    const trustee = fields[5]?.trim();
    if (trustee !== undefined && WORLD_TRUSTEES.has(trustee)) found.add(trustee);
  }
  return [...found];
}

/**
 * Reads the security descriptor of one path.
 *
 * `unknown` is a first-class answer: a missing PowerShell, a refused call or an
 * unparsable answer must never be rounded up to `ok`, because that is exactly
 * the silence this check exists to remove.
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
    { env: { WARPMETAL_ACL_PATH: targetPath } },
  );

  if (result.code === 127) {
    return { status: "unknown", trustees: [], detail: "PowerShell is not available" };
  }
  const sddl = result.stdout.trim();
  if (result.code !== 0 || !sddl.includes("D:")) {
    return {
      status: "unknown",
      trustees: [],
      detail: `the security descriptor could not be read (exit ${String(result.code)})`,
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
