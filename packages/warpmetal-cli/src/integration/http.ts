/**
 * A very small HTTP client wrapper.
 *
 * Two jobs: never throw on a provider error (a 403 is data, not an exception),
 * and never let a response body reach stdout unredacted. The body is returned
 * as parsed JSON plus raw text; callers pass it through the `Redactor` before
 * printing, so a token echoed back by a provider cannot leak.
 */
export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly json: unknown;
  readonly text: string;
}

export type HttpFn = (request: HttpRequest) => Promise<HttpResponse>;

export function createHttp(fetchFn: typeof fetch, defaultTimeoutMs = 15000): HttpFn {
  return async (request) => {
    const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
    let response: Response;
    try {
      response = await fetchFn(request.url, {
        method: request.method,
        headers: {
          accept: "application/json",
          ...(request.body !== undefined ? { "content-type": "application/json" } : {}),
          ...request.headers,
        },
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Network failure is a first-class result: the caller decides whether it
      // means "no auth" or "provider is down".
      return { status: 0, ok: false, json: null, text: (error as Error).message };
    }

    const text = await response.text().catch(() => "");
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: response.status, ok: response.ok, json, text };
  };
}
