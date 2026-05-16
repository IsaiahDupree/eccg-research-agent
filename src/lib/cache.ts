/**
 * Tiny disk cache. Keyed by SHA-1 of (source, params).
 *
 * On Vercel (read-only FS) writes are no-ops; reads always miss. That's
 * fine — Vercel calls hit live APIs and we rely on KV/Blob for state.
 * Locally + in tests, this avoids hammering arXiv during dev.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";

const ROOT = process.env.ECCG_CACHE_DIR ?? ".cache";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function keyOf(source: string, params: unknown): string {
  const h = createHash("sha1").update(JSON.stringify(params)).digest("hex").slice(0, 16);
  return join(ROOT, source, `${h}.json`);
}

export async function cacheGet<T>(source: string, params: unknown): Promise<T | null> {
  const path = keyOf(source, params);
  try {
    const st = await stat(path);
    if (Date.now() - st.mtimeMs > TTL_MS) return null;
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(source: string, params: unknown, value: unknown): Promise<void> {
  const path = keyOf(source, params);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value));
  } catch {
    // Vercel FS is read-only — swallow.
  }
}

export async function withCache<T>(
  source: string,
  params: unknown,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(source, params);
  if (hit) return hit;
  const fresh = await fetcher();
  await cacheSet(source, params, fresh);
  return fresh;
}
