/**
 * cloudflare-allowlist.test.ts - the two rules that keep the Cloudflare
 * allowlist honest at the size it is about to reach.
 *
 * The validator is the only thing standing between a curator's edit and 1,200
 * shipped tools, and both rules here are the kind that would otherwise be
 * discovered by a caller:
 *
 *   - the digest, which ties every reviewed decision to the exact API document
 *     they were made against, so a spec that moved underneath is caught here
 *     instead of by a tool that now sends the wrong field;
 *   - `rawBody`, the reviewed exception for an operation whose body the spec
 *     publishes no field list for, which is also the rule that keeps a binary or
 *     multipart body out of a surface that only carries JSON.
 *
 * The stub spec is deliberately tiny: the rule lives in the validator, not in
 * how a document was parsed, and `spec.mjs` is what hashes the real one.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadAllowlist } from "../scripts/cloudflare/allowlist.mjs";

const REVIEWED_DIGEST = "2f54916a15c27eb354e330dcc162a519f9822f021ab83975be9ef97ce707c51f";

interface StubOperation {
  readonly method: string;
  readonly path: string;
  readonly toolSlug: string;
  readonly body?: { readonly kind: string; readonly contentType?: string };
}

function stubSpec(operations: readonly StubOperation[], sha256?: string) {
  return {
    ...(sha256 === undefined ? {} : { sha256 }),
    byKey: new Map(
      operations.map((op) => [
        `${op.method} ${op.path}`,
        {
          method: op.method,
          path: op.path,
          toolSlug: op.toolSlug,
          body: op.body ?? null,
          confirm: false,
          deprecated: false,
          filtered: false,
          hidden: false,
          publicHint: false,
        },
      ]),
    ),
  };
}

/** A document whose single entry is valid unless the case says otherwise. */
function documentOf(
  entry: Record<string, unknown>,
  spec: Record<string, unknown> = { sha256: REVIEWED_DIGEST },
) {
  return {
    version: 1,
    spec,
    waves: { w1: { status: "reviewed" } },
    tools: [
      {
        toolSlug: "cloudflare_x_create",
        method: "POST",
        path: "/x",
        wave: "w1",
        reason: "A reason long enough for the validator to accept it.",
        destructive: false,
        auth: "api-token",
        ...entry,
      },
    ],
  };
}

function problemsFor(
  entry: Record<string, unknown>,
  operation: StubOperation,
  specDocument: Record<string, unknown> = { sha256: REVIEWED_DIGEST },
  specSha256: string | undefined = REVIEWED_DIGEST,
) {
  const result = loadAllowlist(
    "",
    stubSpec([operation], specSha256),
    documentOf(entry, specDocument),
  );
  return result.problems as string[];
}

const RAW_OPERATION: StubOperation = {
  method: "POST",
  path: "/x",
  toolSlug: "cloudflare_x_create",
  body: { kind: "unsupported", contentType: "application/json" },
};

describe("cloudflare allowlist digest", () => {
  it("refuses a document reviewed against a different spec", () => {
    const problems = problemsFor({ rawBody: true }, RAW_OPERATION, { sha256: "0".repeat(64) });
    assert.equal(problems.length, 1);
    assert.match(
      problems[0] ?? "",
      /spec\.sha256 is 0{64} but the loaded document hashes to 2f54916a/,
      "the mismatch must name both digests",
    );
  });

  it("accepts a document whose digest is the one that was loaded", () => {
    assert.deepEqual(problemsFor({ rawBody: true }, RAW_OPERATION), []);
  });

  it("does not invent a digest problem for a spec that carries none", () => {
    // The stub specs the other suites build have no digest of their own, and a
    // missing one is not a mismatch.
    const problems = problemsFor({ rawBody: true }, RAW_OPERATION, {}, undefined);
    assert.deepEqual(problems, []);
  });
});

describe("cloudflare allowlist raw bodies", () => {
  it("refuses a body with no published field list unless it is reviewed", () => {
    const problems = problemsFor({}, RAW_OPERATION);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? "", /add rawBody: true to send it verbatim as a string/);
  });

  for (const contentType of [
    "application/json",
    "application/x-ndjson",
    "text/plain",
    "application/vnd.api+json",
  ]) {
    it(`accepts a reviewed ${contentType} body`, () => {
      const problems = problemsFor({ rawBody: true }, {
        ...RAW_OPERATION,
        body: { kind: "unsupported", contentType },
      });
      assert.deepEqual(problems, []);
    });
  }

  for (const contentType of ["application/octet-stream", "multipart/form-data"]) {
    it(`refuses a ${contentType} body even when reviewed`, () => {
      const problems = problemsFor({ rawBody: true }, {
        ...RAW_OPERATION,
        body: { kind: "unsupported", contentType },
      });
      assert.equal(problems.length, 1);
      assert.match(problems[0] ?? "", /which a JSON argument cannot carry/);
    });
  }

  it("refuses rawBody on a body the spec does describe as fields", () => {
    const problems = problemsFor({ rawBody: true }, {
      ...RAW_OPERATION,
      body: { kind: "object", contentType: "application/json" },
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? "", /rawBody only applies to a body the spec does not publish/);
  });

  it("refuses a rawBody that is not a boolean", () => {
    const problems = problemsFor({ rawBody: "yes" }, RAW_OPERATION);
    assert.ok(
      problems.some((problem) => problem.includes("rawBody must be true or false")),
      "a truthy string must not pass as a reviewed decision",
    );
  });

  it("still requires freeFormBody on a body the spec leaves open", () => {
    const problems = problemsFor({}, {
      ...RAW_OPERATION,
      body: { kind: "free-form", contentType: "application/json" },
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? "", /add freeFormBody: true/);
  });
});
