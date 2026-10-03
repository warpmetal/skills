/**
 * Output sinks and redaction.
 *
 * Two rules, both enforced here rather than at each call site:
 *
 *   1. `--json` output is secret-redacted. A field whose *name* looks like a
 *      credential is replaced wholesale, and any registered secret *value* is
 *      scrubbed wherever it appears, including inside nested strings.
 *   2. Nothing here ever writes a secret value unless the caller asked for the
 *      one documented emission path (`env secret --stdout`), which bypasses
 *      this module on purpose by writing to the raw stdout sink.
 */
export interface Out {
  stdout(text: string): void;
  stderr(text: string): void;
}

export function createOut(): Out {
  return {
    stdout(text: string) {
      process.stdout.write(text);
    },
    stderr(text: string) {
      process.stderr.write(text);
    },
  };
}

/** A sink that records everything, used by the tests. */
export interface CapturedOut extends Out {
  readonly out: string[];
  readonly err: string[];
}

export function captureOut(): CapturedOut {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  };
}

const SENSITIVE_KEY =
  /(token|secret|password|passphrase|api[-_]?key|authorization|bearer|credential|private[-_]?key)/i;

const REDACTED = "[redacted]";

/**
 * Values never shipped to any output stream. Registered from the store when a
 * command loads secrets, so a value cannot leak through an error message that
 * happens to embed a provider response.
 */
export class Redactor {
  readonly #values = new Set<string>();

  add(value: string | null | undefined): void {
    if (typeof value === "string" && value.length >= 8) {
      this.#values.add(value);
    }
  }

  get size(): number {
    return this.#values.size;
  }

  scrub(text: string): string {
    let result = text;
    // Longest first, so a value that contains another is replaced as a whole.
    const ordered = [...this.#values].sort((left, right) => right.length - left.length);
    for (const value of ordered) {
      if (value.length === 0) continue;
      result = result.split(value).join(REDACTED);
    }
    return result;
  }

  /** Deep clone with sensitive keys and registered values replaced. */
  value(input: unknown): unknown {
    return this.#walk(input, 0);
  }

  #walk(input: unknown, depth: number): unknown {
    if (depth > 12) return "[depth-limit]";
    if (typeof input === "string") return this.scrub(input);
    if (input === null || typeof input !== "object") return input;
    if (Array.isArray(input)) return input.map((entry) => this.#walk(entry, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(input as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : this.#walk(entry, depth + 1);
    }
    return out;
  }
}

export function jsonText(value: unknown, redactor?: Redactor): string {
  const safe = redactor ? redactor.value(value) : value;
  return `${JSON.stringify(safe, null, 2)}\n`;
}
