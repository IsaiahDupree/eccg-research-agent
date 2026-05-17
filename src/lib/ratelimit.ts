/**
 * Token-bucket rate limiter for write endpoints.
 *
 * State lives in Drive (`eccg-state—ratelimit.json`) as
 * `{ [actorKey]: { tokens, last_refill_ms } }`. Each request decrements
 * one token; tokens regenerate at `rate / windowMs` per ms up to a
 * capacity of `rate`. Reads are best-effort cached so a burst doesn't
 * hammer Drive.
 *
 * Defaults (override via env):
 *   ECCG_RATELIMIT_WRITES_PER_HOUR (default 60)
 *
 * Actor identity precedence (most specific wins):
 *   1. API token attribution (if hit /api/review with X-API-Token)
 *   2. Verified session email
 *   3. Self-declared alias
 *   4. "anonymous"
 */

import { readState, writeState } from "./google/state";

export const RATELIMIT_STATE = "ratelimit";

export interface ActorIdentity {
  alias?: string | null;
  email?: string | null;
  apiTokenAttribution?: string | null;
}

export interface BucketResult {
  ok: boolean;
  remaining: number;
  reset_ms: number; // wall-clock ms when at least one token will be available
  limit: number;
  retry_after_ms?: number;
}

interface Bucket {
  tokens: number;
  last_refill_ms: number;
}

type BucketMap = Record<string, Bucket>;

const DEFAULT_RATE = Number(process.env.ECCG_RATELIMIT_WRITES_PER_HOUR ?? "60");
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const READ_CACHE_MS = 5_000;

let cache: { value: BucketMap; loaded_at: number } | null = null;

export function actorKey(id: ActorIdentity): string {
  if (id.apiTokenAttribution) return `token:${id.apiTokenAttribution.toLowerCase()}`;
  if (id.email) return `email:${id.email.toLowerCase()}`;
  if (id.alias) return `alias:${id.alias.toLowerCase()}`;
  return "anonymous";
}

/**
 * Pure token-bucket math. Returns the bucket state *after* the request
 * is hypothetically charged. Caller decides whether to persist + allow.
 */
export function computeBucketState(
  prev: Bucket | undefined,
  now: number,
  rate: number,
  windowMs: number,
): { allowed: boolean; bucket: Bucket; result: BucketResult } {
  const capacity = rate;
  // Refill: linear regeneration at rate / windowMs tokens per ms.
  const last = prev?.last_refill_ms ?? now;
  const start = prev?.tokens ?? capacity;
  const elapsed = Math.max(0, now - last);
  const refilled = (elapsed / windowMs) * rate;
  const available = Math.min(capacity, start + refilled);
  if (available < 1) {
    const need = 1 - available;
    const ms_until_token = (need / rate) * windowMs;
    return {
      allowed: false,
      bucket: { tokens: available, last_refill_ms: now },
      result: {
        ok: false,
        remaining: 0,
        reset_ms: now + ms_until_token,
        retry_after_ms: ms_until_token,
        limit: capacity,
      },
    };
  }
  const after = available - 1;
  return {
    allowed: true,
    bucket: { tokens: after, last_refill_ms: now },
    result: {
      ok: true,
      remaining: Math.floor(after),
      reset_ms: now + ((capacity - after) / rate) * windowMs,
      limit: capacity,
    },
  };
}

async function loadMap(): Promise<BucketMap> {
  if (cache && Date.now() - cache.loaded_at < READ_CACHE_MS) return cache.value;
  const value = await readState<BucketMap>(RATELIMIT_STATE, {});
  cache = { value, loaded_at: Date.now() };
  return value;
}

async function saveMap(value: BucketMap): Promise<void> {
  cache = { value, loaded_at: Date.now() };
  await writeState(RATELIMIT_STATE, value);
}

/**
 * Charge one token for `identity`. Returns whether the request is allowed
 * plus headers callers should propagate (X-RateLimit-*). Errors out to
 * "allowed" if Drive isn't reachable — a transient failure shouldn't
 * cause a 429 storm.
 */
export async function rateLimit(
  identity: ActorIdentity,
  opts: { rate?: number; windowMs?: number } = {},
): Promise<BucketResult> {
  const rate = opts.rate ?? DEFAULT_RATE;
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const key = actorKey(identity);
  const now = Date.now();
  try {
    const map = await loadMap();
    const { allowed, bucket, result } = computeBucketState(
      map[key],
      now,
      rate,
      windowMs,
    );
    if (allowed) {
      map[key] = bucket;
      // Periodic prune of stale entries to keep the state file small.
      if (Object.keys(map).length > 200) {
        const cutoff = now - 7 * 24 * 60 * 60 * 1000;
        for (const k of Object.keys(map)) {
          if ((map[k].last_refill_ms ?? 0) < cutoff) delete map[k];
        }
      }
      await saveMap(map).catch(() => {});
    }
    return result;
  } catch (err) {
    console.warn("[ratelimit] degraded, allowing:", err);
    return { ok: true, remaining: rate, reset_ms: now + windowMs, limit: rate };
  }
}

/** Build the Headers a 429 response should include. */
export function rateLimitHeaders(r: BucketResult): Record<string, string> {
  const h: Record<string, string> = {
    "x-ratelimit-limit": String(r.limit),
    "x-ratelimit-remaining": String(r.remaining),
    "x-ratelimit-reset": String(Math.ceil(r.reset_ms / 1000)),
  };
  if (!r.ok && r.retry_after_ms !== undefined) {
    h["retry-after"] = String(Math.max(1, Math.ceil(r.retry_after_ms / 1000)));
  }
  return h;
}
