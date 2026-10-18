import { describe, it, expect } from "vitest";
import {
  actorKey,
  computeBucketState,
  rateLimitHeaders,
} from "@/lib/ratelimit";

const RATE = 60;
const WINDOW = 60 * 60 * 1000; // 1 hour

describe("actorKey — precedence", () => {
  it("API token attribution wins over email + alias", () => {
    expect(
      actorKey({
        apiTokenAttribution: "bot-cron",
        email: "alice@example.com",
        alias: "alice",
      }),
    ).toBe("token:bot-cron");
  });

  it("email wins over alias when no token", () => {
    expect(actorKey({ email: "ALICE@x.com", alias: "alice" })).toBe("email:alice@x.com");
  });

  it("alias used when no email/token", () => {
    expect(actorKey({ alias: "Alice" })).toBe("alias:alice");
  });

  it("falls back to 'anonymous' when nothing provided", () => {
    expect(actorKey({})).toBe("anonymous");
  });

  it("treats null and undefined the same as missing", () => {
    expect(actorKey({ alias: null, email: undefined })).toBe("anonymous");
  });

  it("lowercases the API token attribution", () => {
    expect(actorKey({ apiTokenAttribution: "BOT" })).toBe("token:bot");
  });
});

describe("computeBucketState — happy path", () => {
  it("first request returns allowed with capacity-1 tokens remaining", () => {
    const { allowed, bucket, result } = computeBucketState(undefined, 0, RATE, WINDOW);
    expect(allowed).toBe(true);
    expect(bucket.tokens).toBeCloseTo(RATE - 1, 4);
    expect(result.remaining).toBe(RATE - 1);
    expect(result.limit).toBe(RATE);
  });

  it("ok=true for every request within capacity", () => {
    let prev: { tokens: number; last_refill_ms: number } | undefined;
    for (let i = 0; i < 10; i++) {
      const { allowed, bucket } = computeBucketState(prev, 0, RATE, WINDOW);
      expect(allowed).toBe(true);
      prev = bucket;
    }
  });

  it("rejects request once tokens are exhausted at fixed time", () => {
    let prev: { tokens: number; last_refill_ms: number } | undefined;
    for (let i = 0; i < RATE; i++) {
      const r = computeBucketState(prev, 0, RATE, WINDOW);
      expect(r.allowed).toBe(true);
      prev = r.bucket;
    }
    const r = computeBucketState(prev, 0, RATE, WINDOW);
    expect(r.allowed).toBe(false);
    expect(r.result.retry_after_ms).toBeGreaterThan(0);
  });

  it("refills linearly over time", () => {
    // Drain bucket
    let prev: { tokens: number; last_refill_ms: number } | undefined = {
      tokens: 0,
      last_refill_ms: 0,
    };
    // After half a window we should have ~capacity/2 tokens
    const r = computeBucketState(prev, WINDOW / 2, RATE, WINDOW);
    expect(r.allowed).toBe(true);
    expect(r.bucket.tokens).toBeCloseTo(RATE / 2 - 1, 1);
  });

  it("never exceeds capacity even after long idle", () => {
    const r = computeBucketState(
      { tokens: 10, last_refill_ms: 0 },
      WINDOW * 10,
      RATE,
      WINDOW,
    );
    expect(r.bucket.tokens).toBeLessThanOrEqual(RATE);
  });

  it("zero rate → every request denied", () => {
    const r = computeBucketState(undefined, 0, 0, WINDOW);
    expect(r.allowed).toBe(false);
  });

  it("rate=1 → exactly one request per window", () => {
    const r1 = computeBucketState(undefined, 0, 1, WINDOW);
    expect(r1.allowed).toBe(true);
    const r2 = computeBucketState(r1.bucket, 0, 1, WINDOW);
    expect(r2.allowed).toBe(false);
  });

  it("rate=1 refills after exactly one window", () => {
    const r1 = computeBucketState(undefined, 0, 1, WINDOW);
    const r2 = computeBucketState(r1.bucket, WINDOW, 1, WINDOW);
    expect(r2.allowed).toBe(true);
  });
});

describe("computeBucketState — retry_after_ms", () => {
  it("reports retry_after when denied", () => {
    const r = computeBucketState({ tokens: 0, last_refill_ms: 0 }, 0, RATE, WINDOW);
    expect(r.allowed).toBe(false);
    expect(r.result.retry_after_ms).toBeCloseTo(WINDOW / RATE, 0);
  });

  it("does not set retry_after when allowed", () => {
    const r = computeBucketState(undefined, 0, RATE, WINDOW);
    expect(r.result.retry_after_ms).toBeUndefined();
  });
});

describe("computeBucketState — remaining count", () => {
  it("remaining = floor(tokens) after charge", () => {
    const r = computeBucketState(
      { tokens: 5.5, last_refill_ms: 0 },
      0,
      RATE,
      WINDOW,
    );
    expect(r.result.remaining).toBe(Math.floor(5.5 - 1));
  });

  it("remaining clamps at 0 (never negative)", () => {
    const r = computeBucketState({ tokens: 0, last_refill_ms: 0 }, 0, RATE, WINDOW);
    expect(r.result.remaining).toBe(0);
  });
});

describe("rateLimitHeaders", () => {
  it("emits ratelimit headers on allowed result", () => {
    const h = rateLimitHeaders({ ok: true, remaining: 5, reset_ms: 1_000_000, limit: 10 });
    expect(h["x-ratelimit-limit"]).toBe("10");
    expect(h["x-ratelimit-remaining"]).toBe("5");
    expect(h).not.toHaveProperty("retry-after");
  });

  it("emits Retry-After (seconds) when denied", () => {
    const h = rateLimitHeaders({
      ok: false,
      remaining: 0,
      reset_ms: Date.now() + 2_500,
      limit: 10,
      retry_after_ms: 2_500,
    });
    expect(Number(h["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  it("Retry-After never below 1 second", () => {
    const h = rateLimitHeaders({
      ok: false,
      remaining: 0,
      reset_ms: Date.now(),
      limit: 10,
      retry_after_ms: 0,
    });
    expect(Number(h["retry-after"])).toBe(1);
  });

  it("x-ratelimit-reset is in seconds, not ms", () => {
    const h = rateLimitHeaders({
      ok: true,
      remaining: 1,
      reset_ms: 3_000_000,
      limit: 10,
    });
    expect(h["x-ratelimit-reset"]).toBe("3000");
  });

  it("never throws on edge inputs", () => {
    expect(() =>
      rateLimitHeaders({ ok: false, remaining: 0, reset_ms: 0, limit: 0 }),
    ).not.toThrow();
  });
});
