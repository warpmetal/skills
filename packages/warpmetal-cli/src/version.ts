import { readFileSync } from "node:fs";

/**
 * The package version is read from package.json at runtime so releases only
 * need to bump one place. Falls back to a static value outside a package.
 */
export function packageVersion(): string {
  try {
    const url = new URL("../package.json", import.meta.url);
    const parsed = JSON.parse(readFileSync(url, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
