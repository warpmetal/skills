import assert from "node:assert/strict";
import test from "node:test";

import { scanTextForSecrets } from "./secrets.mjs";

/**
 * A token-shaped string that is not a credential. It is built at run time rather
 * than written literally so that this test file does not itself trip the scan it
 * is testing - the alternative would be an exemption marker in the one file
 * whose job is to prove exemptions are not automatic.
 */
const FAKE_GITHUB_TOKEN = `ghp_${"a".repeat(36)}`;

test("finds a secret-shaped string and reports its line", () => {
  const text = ["clean line", "const token = 'unused';", `const key = "${FAKE_GITHUB_TOKEN}";`].join("\n");
  assert.deepEqual(scanTextForSecrets(text), [{ line: 3, message: "possible github token" }]);
});

test("returns nothing for text with no secret shape", () => {
  const text = "name: demo\ndescription: a fixture\n".repeat(50);
  assert.deepEqual(scanTextForSecrets(text), []);
});

test("exempts only the line that carries a reasoned marker", () => {
  const text = [
    `const a = "${FAKE_GITHUB_TOKEN}";`,
    `const b = "${FAKE_GITHUB_TOKEN}"; // secret-scan:allow redaction fixture`,
  ].join("\n");
  assert.deepEqual(scanTextForSecrets(text), [{ line: 1, message: "possible github token" }]);
});

test("a marker with no reason is reported instead of honoured", () => {
  // The whole point of the marker: without a reason it is indistinguishable from
  // waving a real finding through, so it is a problem rather than an exemption.
  const text = `const a = "${FAKE_GITHUB_TOKEN}"; // secret-scan:allow`;
  assert.deepEqual(scanTextForSecrets(text), [
    {
      line: 1,
      message: "has a secret-scan:allow marker with no reason; give one or remove the marker",
    },
  ]);
});

test("a marker with only whitespace after it is also reported", () => {
  const text = `const a = "${FAKE_GITHUB_TOKEN}"; // secret-scan:allow   `;
  const findings = scanTextForSecrets(text);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /with no reason/);
});

test("exempts a marker at the end of a CRLF line", () => {
  // A Windows checkout must not silently disable every exemption.
  const text = `const a = "${FAKE_GITHUB_TOKEN}"; // secret-scan:allow redaction fixture\r\nconst b = 1;\r\n`;
  assert.deepEqual(scanTextForSecrets(text), []);
});

test("reports every pattern on a line, and every line that matches", () => {
  const pem = "-----BEGIN OPENSSH PRIVATE KEY-----";
  const text = [`const pem = "${pem}";`, "clean", `const key = "${FAKE_GITHUB_TOKEN}";`].join("\n");
  assert.deepEqual(scanTextForSecrets(text), [
    { line: 1, message: "possible private key" },
    { line: 3, message: "possible github token" },
  ]);
});

test("does not treat an ordinary hex string as a Cloudflare global key", () => {
  // 36 and 38 hex characters sit either side of the 37 the pattern wants; an
  // off-by-one here would flag generated catalogs full of ids.
  const text = `a=${"0".repeat(36)}\nb=${"0".repeat(38)}\n`;
  assert.deepEqual(scanTextForSecrets(text), []);
});
