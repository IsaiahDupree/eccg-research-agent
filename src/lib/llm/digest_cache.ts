/**
 * Drive-backed cache of LLM-generated paper digests.
 *
 * `generateDigest()` costs real money; the same paper is opened by every
 * editor reading /review, every visitor on /paper/[id], and the weekly
 * digest job. Caching keyed by paper id (+ a content-hash of title+abstract
 * so a corrected abstract invalidates) means each paper is summarised once.
 *
 * Stored as `eccg-state—digests.json`:
 *   { [paperId]: { content_hash, digest, generated_at } }
 */

import { createHash } from "node:crypto";
import type { PaperDigest, ScoredPaper } from "../models";
import { readState, writeState } from "../google/state";

const STATE = "digests";

interface CachedDigest {
  content_hash: string;
  digest: PaperDigest;
  generated_at: string;
}

type DigestMap = Record<string, CachedDigest>;

export function contentHash(s: ScoredPaper): string {
  return createHash("sha1")
    .update(`${s.paper.title}\n${s.paper.abstract.slice(0, 4000)}`)
    .digest("hex")
    .slice(0, 16);
}

export async function loadDigestCache(): Promise<DigestMap> {
  return readState<DigestMap>(STATE, {});
}

export async function readCachedDigest(s: ScoredPaper): Promise<PaperDigest | null> {
  const cache = await loadDigestCache();
  const hit = cache[s.paper.id];
  if (!hit) return null;
  if (hit.content_hash !== contentHash(s)) return null;
  return hit.digest;
}

export async function writeCachedDigest(
  s: ScoredPaper,
  digest: PaperDigest,
): Promise<void> {
  const cache = await loadDigestCache();
  cache[s.paper.id] = {
    content_hash: contentHash(s),
    digest,
    generated_at: digest.generated_at,
  };
  await writeState<DigestMap>(STATE, cache);
}
