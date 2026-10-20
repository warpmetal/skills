/**
 * The secret-shaped patterns `npm run verify` looks for, and the exemption
 * marker that goes with them.
 *
 * This lives here rather than inside `scripts/verify.mjs` because that file is a
 * script: it checks the real repository at import time, so nothing in it can be
 * tested against a fixture. The patterns are the part worth testing - a pattern
 * that silently stops matching is how a credential reaches a published package.
 */

export const SECRET_PATTERNS = [
  { name: "aws access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "private key", regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { name: "github token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: "gitlab token", regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: "openai key", regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  // A Slack incoming webhook is a bearer credential in URL form: it is the whole
  // authorisation to post to a channel, so it belongs in this list.
  { name: "slack webhook", regex: /hooks\.slack\.com\/services\/[A-Za-z0-9+/]{8,}/ },
  { name: "cloudflare global key", regex: /\b[0-9a-f]{37}\b/ },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

/**
 * `secret-scan:allow <reason>` on the same line as a match exempts that line.
 *
 * Requiring a reason is the whole point. The one legitimate use is a test
 * fixture that must contain a key-shaped string to prove the redactor works, and
 * a bare marker is how a real finding would be waved through; so a marker with
 * nothing after it is reported as a problem rather than honoured.
 */
export const SECRET_SCAN_ALLOW = /secret-scan:allow[ \t]+(\S(?:.*\S)?)[ \t]*$/;
export const SECRET_SCAN_BARE = /secret-scan:allow[ \t]*$/;

/**
 * Finds secret-shaped strings in `text`, one finding per line.
 *
 * Per line, so an exemption attaches to the single line that needs it instead of
 * exempting a whole file. The whole-text test runs first: when nothing matches -
 * the case for almost every file - the line pass is skipped, which matters
 * because one of the scanned files is a 2.4 MB generated catalog.
 *
 * Returns `[{ line, message }]`; the caller adds the path.
 */
export function scanTextForSecrets(text) {
  const findings = [];
  const candidates = SECRET_PATTERNS.filter((pattern) => pattern.regex.test(text));
  if (candidates.length === 0) return findings;

  // Split on both endings: a CRLF checkout would otherwise leave a trailing CR
  // on every line, and the exemption marker is anchored to the end of one.
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (SECRET_SCAN_BARE.test(line)) {
      findings.push({
        line: lineNumber,
        message: "has a secret-scan:allow marker with no reason; give one or remove the marker",
      });
      continue;
    }
    if (SECRET_SCAN_ALLOW.test(line)) continue;
    for (const pattern of candidates) {
      if (pattern.regex.test(line)) {
        findings.push({ line: lineNumber, message: `possible ${pattern.name}` });
      }
    }
  }
  return findings;
}
