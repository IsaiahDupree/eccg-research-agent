/**
 * fetchWithRetry — exponential backoff + jitter for external APIs that
 * commonly 429 (arxiv, Semantic Scholar) or 5xx (OpenAI, Crossref).
 *
 * Behaviour:
 *   - Pass-through on 2xx.
 *   - On 429 / 5xx, sleep `baseMs * 2^attempt + jitter` then retry, up to
 *     `maxAttempts`. Honour the server's `Retry-After` header when present.
 *   - On the final failed attempt, return the Response so the caller can
 *     decide whether to throw, log, or fall back.
 *   - On network error (fetch throws), retry the same way. Final attempt
 *     re-throws.
 */

export interface FetchRetryOptions {
  /** Total attempts including the first try (default 4). */
  maxAttempts?: number;
  /** First-retry delay in ms; doubles each attempt (default 500). */
  baseMs?: number;
  /** Cap any single sleep at this many ms (default 30_000). */
  maxBackoffMs?: number;
  /** HTTP status codes that should trigger a retry (default 429 + 5xx). */
  retryOn?: (status: number) => boolean;
  /** Called once per attempt with the attempt number + reason — for logging. */
  onRetry?: (attempt: number, reason: string, waitMs: number) => void;
}

function jitter(): number {
  return Math.floor(Math.random() * 250);
}

function defaultShouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  // Two valid forms: seconds or an HTTP-date.
  const asNumber = Number(header);
  if (Number.isFinite(asNumber)) return asNumber * 1000;
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    const diff = asDate - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const {
    maxAttempts = 4,
    baseMs = 500,
    maxBackoffMs = 30_000,
    retryOn = defaultShouldRetry,
    onRetry,
  } = opts;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(input, init);
      if (!retryOn(res.status)) return res;
      if (attempt + 1 >= maxAttempts) return res;
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      const backoff = Math.min(maxBackoffMs, baseMs * 2 ** attempt) + jitter();
      const wait = retryAfter ?? backoff;
      onRetry?.(attempt + 1, `http ${res.status}`, wait);
      await sleep(wait);
    } catch (err) {
      lastError = err;
      if (attempt + 1 >= maxAttempts) throw err;
      const backoff = Math.min(maxBackoffMs, baseMs * 2 ** attempt) + jitter();
      onRetry?.(attempt + 1, `network error: ${err instanceof Error ? err.message : "?"}`, backoff);
      await sleep(backoff);
    }
  }
  // Should never reach here — the loop returns or throws above.
  throw lastError ?? new Error("fetchWithRetry exhausted attempts");
}
