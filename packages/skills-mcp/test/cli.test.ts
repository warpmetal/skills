import assert from "node:assert/strict";
import test from "node:test";

import { parseArguments } from "../src/cli.js";

test("--no-fallback parses to noFallback: true", () => {
  const options = parseArguments(["--no-fallback"]);
  assert.equal(options.noFallback, true);
  assert.equal(options.offline, false);
});

test("noFallback defaults to false", () => {
  assert.equal(parseArguments([]).noFallback, false);
});

test("--no-fallback with --offline is rejected", () => {
  assert.throws(
    () => parseArguments(["--no-fallback", "--offline"]),
    (error: unknown) => (error as { code?: string }).code === "invalid_request",
  );
});

test("--no-fallback with a remote --registry is allowed", () => {
  const options = parseArguments(["--no-fallback", "--registry", "https://example.test/registry.json"]);
  assert.equal(options.noFallback, true);
  assert.equal(options.registry, "https://example.test/registry.json");
});

test("--profile chatgpt-local parses to the chatgpt-local profile", () => {
  assert.equal(parseArguments(["--profile", "chatgpt-local"]).profile, "chatgpt-local");
});

test("profile defaults to full", () => {
  assert.equal(parseArguments([]).profile, "full");
});

test("--profile rejects a value outside the enum", () => {
  assert.throws(
    () => parseArguments(["--profile", "content"]),
    (error: unknown) => (error as { code?: string }).code === "invalid_request",
  );
});

test("--profile cannot be combined with --http", () => {
  for (const profile of ["full", "chatgpt-local"]) {
    assert.throws(
      () => parseArguments(["--profile", profile, "--http"]),
      (error: unknown) => (error as { code?: string }).code === "invalid_request",
    );
  }
});

test("--http alone keeps parsing with the default profile", () => {
  const options = parseArguments(["--http"]);
  assert.equal(options.http, true);
  assert.equal(options.profile, "full");
});
