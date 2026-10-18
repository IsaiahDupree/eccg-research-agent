import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry } from "@/lib/fetch_retry";

const originalFetch = globalThis.fetch;

function stub(responses: (Response | Error)[]): ReturnType<typeof vi.fn> {
  let i = 0;
  const fn = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    if (r instanceof Error) throw r;
    return r.clone();
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

async function drain<T>(p: Promise<T>): Promise<T> {
  // Observe the promise via a direct then-handler so a rejection during
  // the timer-advance loop doesn't surface as unhandled. Then re-throw
  // on settle so the caller's expectation matchers (rejects.toThrow)
  // still see the original error.
  let settled:
    | { kind: "resolved"; value: T }
    | { kind: "rejected"; reason: unknown }
    | null = null;
  p.then(
    (value) => {
      settled = { kind: "resolved", value };
    },
    (reason) => {
      settled = { kind: "rejected", reason };
    },
  );
  for (let i = 0; i < 100 && !settled; i++) {
    await vi.advanceTimersByTimeAsync(50);
    await Promise.resolve();
  }
  const s = settled as
    | { kind: "resolved"; value: T }
    | { kind: "rejected"; reason: unknown }
    | null;
  if (!s) throw new Error("drain timed out");
  if (s.kind === "rejected") throw s.reason;
  return s.value;
}

describe("fetchWithRetry — happy paths", () => {
  it("returns 2xx immediately without retry", async () => {
    const spy = stub([new Response("ok", { status: 200 })]);
    const res = await fetchWithRetry("https://example.com");
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns 3xx immediately (3xx is not retried)", async () => {
    const spy = stub([new Response(null, { status: 301 })]);
    const res = await fetchWithRetry("https://example.com");
    expect(res.status).toBe(301);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns 4xx other than 429 immediately", async () => {
    const spy = stub([new Response("not found", { status: 404 })]);
    const res = await fetchWithRetry("https://example.com");
    expect(res.status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns 401 immediately (auth errors don't retry)", async () => {
    const spy = stub([new Response("unauth", { status: 401 })]);
    const res = await fetchWithRetry("https://example.com");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it("returns 403 immediately", async () => {
    const spy = stub([new Response("forbidden", { status: 403 })]);
    await fetchWithRetry("https://example.com");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("fetchWithRetry — retry on 429 / 5xx", () => {
  it("retries on 429 then succeeds", async () => {
    const spy = stub([
      new Response(null, { status: 429 }),
      new Response("ok", { status: 200 }),
    ]);
    const res = await drain(
      fetchWithRetry("https://example.com", undefined, { baseMs: 10 }),
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("retries on 500 then succeeds", async () => {
    const spy = stub([
      new Response(null, { status: 500 }),
      new Response("ok", { status: 200 }),
    ]);
    const res = await drain(
      fetchWithRetry("https://example.com", undefined, { baseMs: 10 }),
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("retries on 502 / 503 / 504", async () => {
    for (const code of [502, 503, 504]) {
      const spy = stub([
        new Response(null, { status: code }),
        new Response("ok", { status: 200 }),
      ]);
      const res = await drain(
        fetchWithRetry("https://example.com", undefined, { baseMs: 10 }),
      );
      expect(spy).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(200);
    }
  });

  it("returns the last 429 after maxAttempts exhausted", async () => {
    const spy = stub([
      new Response(null, { status: 429 }),
      new Response(null, { status: 429 }),
      new Response(null, { status: 429 }),
    ]);
    const res = await drain(
      fetchWithRetry("https://example.com", undefined, { maxAttempts: 3, baseMs: 10 }),
    );
    expect(spy).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(429);
  });

  it("returns the last 503 after maxAttempts exhausted", async () => {
    stub([
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
    ]);
    const res = await drain(
      fetchWithRetry("https://example.com", undefined, { maxAttempts: 2, baseMs: 10 }),
    );
    expect(res.status).toBe(503);
  });

  it("calls onRetry hook once per retry", async () => {
    const onRetry = vi.fn();
    stub([
      new Response(null, { status: 429 }),
      new Response("ok", { status: 200 }),
    ]);
    await drain(
      fetchWithRetry("https://example.com", undefined, {
        baseMs: 10,
        onRetry,
      }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.stringContaining("429"), expect.any(Number));
  });

  it("respects custom retryOn predicate", async () => {
    const spy = stub([
      new Response(null, { status: 418 }),
      new Response("ok", { status: 200 }),
    ]);
    const res = await drain(
      fetchWithRetry("https://example.com", undefined, {
        baseMs: 10,
        retryOn: (s) => s === 418,
      }),
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("does NOT retry when retryOn returns false", async () => {
    const spy = stub([new Response(null, { status: 429 })]);
    const res = await fetchWithRetry("https://example.com", undefined, {
      retryOn: () => false,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(429);
  });
});

describe("fetchWithRetry — network errors", () => {
  it("retries on network throw, then succeeds", async () => {
    const spy = stub([
      new Error("network down"),
      new Response("ok", { status: 200 }),
    ]);
    const res = await drain(
      fetchWithRetry("https://example.com", undefined, { baseMs: 10 }),
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("re-throws the last network error after maxAttempts", async () => {
    stub([new Error("boom"), new Error("boom"), new Error("boom")]);
    await expect(
      drain(
        fetchWithRetry("https://example.com", undefined, {
          maxAttempts: 3,
          baseMs: 10,
        }),
      ),
    ).rejects.toThrow(/boom/);
  });

  it("network error counts in attempt budget", async () => {
    const spy = stub([new Error("boom"), new Error("boom")]);
    await expect(
      drain(
        fetchWithRetry("https://example.com", undefined, {
          maxAttempts: 2,
          baseMs: 10,
        }),
      ),
    ).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("onRetry receives 'network error' reason", async () => {
    const onRetry = vi.fn();
    stub([new Error("ECONNREFUSED"), new Response("ok", { status: 200 })]);
    await drain(
      fetchWithRetry("https://example.com", undefined, {
        baseMs: 10,
        onRetry,
      }),
    );
    expect(onRetry).toHaveBeenCalledWith(1, expect.stringContaining("network error"), expect.any(Number));
  });
});

describe("fetchWithRetry — Retry-After header", () => {
  it("honours numeric Retry-After (seconds)", async () => {
    const headers = new Headers({ "retry-after": "1" });
    stub([
      new Response(null, { status: 429, headers }),
      new Response("ok", { status: 200 }),
    ]);
    const onRetry = vi.fn();
    await drain(
      fetchWithRetry("https://example.com", undefined, {
        baseMs: 10,
        onRetry,
      }),
    );
    // Numeric "1" → 1000ms wait; backoff calc would give ~10-260ms. So we
    // assert at least 900ms was passed in.
    expect(onRetry.mock.calls[0][2]).toBeGreaterThanOrEqual(900);
  });

  it("falls back to backoff when Retry-After is missing", async () => {
    stub([
      new Response(null, { status: 429 }),
      new Response("ok", { status: 200 }),
    ]);
    const onRetry = vi.fn();
    await drain(
      fetchWithRetry("https://example.com", undefined, {
        baseMs: 10,
        onRetry,
      }),
    );
    expect(onRetry.mock.calls[0][2]).toBeLessThan(1000);
  });

  it("caps backoff at maxBackoffMs", async () => {
    stub([
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
      new Response("ok", { status: 200 }),
    ]);
    const onRetry = vi.fn();
    await drain(
      fetchWithRetry("https://example.com", undefined, {
        baseMs: 100,
        maxBackoffMs: 200,
        maxAttempts: 4,
        onRetry,
      }),
    );
    for (const call of onRetry.mock.calls) {
      // wait includes baseMs * 2^attempt capped + jitter (max 250)
      expect(call[2]).toBeLessThanOrEqual(200 + 250);
    }
  });
});
