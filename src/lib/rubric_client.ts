/**
 * Client-side rubric weight overrides. Persisted to Drive state so the
 * whole team sees the same weights.
 *
 * The base rubric weights live in lib/scoring/weights.ts. This overlay is
 * applied at render time — each category contribution is rescaled to the
 * team's preferred weight, and the totals re-normalised to 0–100.
 */

"use client";

import { useEffect, useState } from "react";

export interface RubricWeightOverrides {
  citation_velocity: number;
  eccg_relevance: number;
  code_availability: number;
  novelty: number;
  venue_prestige: number;
  author_signal: number;
  recency: number;
  community_score: number;
}

export const DEFAULT_WEIGHTS: RubricWeightOverrides = {
  citation_velocity: 18,
  eccg_relevance: 22,
  code_availability: 12,
  novelty: 12,
  venue_prestige: 8,
  author_signal: 8,
  recency: 5,
  community_score: 15,
};

const SYNC_EVENT = "eccg-rubric-sync";

let cache: RubricWeightOverrides | null = null;
let inflight: Promise<RubricWeightOverrides> | null = null;

async function ensureLoaded(): Promise<RubricWeightOverrides> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch("/api/rubric", { cache: "no-store" });
      const j = await r.json();
      cache = { ...DEFAULT_WEIGHTS, ...(j.weights ?? {}) };
    } catch {
      cache = { ...DEFAULT_WEIGHTS };
    }
    return cache!;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

function notify() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  }
}

export function useRubricWeights(): {
  weights: RubricWeightOverrides;
  loaded: boolean;
} {
  const [weights, setWeights] = useState<RubricWeightOverrides>(
    cache ?? DEFAULT_WEIGHTS,
  );
  const [loaded, setLoaded] = useState(cache !== null);
  useEffect(() => {
    let alive = true;
    ensureLoaded().then((w) => {
      if (!alive) return;
      setWeights({ ...w });
      setLoaded(true);
    });
    function onSync() {
      setWeights({ ...(cache ?? DEFAULT_WEIGHTS) });
    }
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      alive = false;
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, []);
  return { weights, loaded };
}

export async function saveRubricWeights(next: RubricWeightOverrides): Promise<boolean> {
  cache = { ...next };
  notify();
  try {
    const r = await fetch("/api/rubric", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weights: next }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function clearRubricCache() {
  cache = null;
  notify();
}

/**
 * Apply the team weight overrides on top of an already-scored paper. We
 * keep the per-axis raw values, rescale by the new weights, and re-normalise
 * to a 0-100 composite. The community_score axis was a placeholder at
 * scoring time; here it gets filled with the live `netVotes` overlay.
 */
export function adjustScore(
  scoredCategories: { name: string; raw: number; weight: number }[],
  weights: RubricWeightOverrides,
  netVotes: number,
): number {
  const lookup = weights as unknown as Record<string, number>;
  let total = 0;
  let totalWeight = 0;
  let sawCommunity = false;
  for (const c of scoredCategories) {
    const w = lookup[c.name] ?? c.weight;
    let raw = c.raw;
    if (c.name === "community_score") {
      sawCommunity = true;
      raw = communityRaw(netVotes);
    }
    total += (raw * w) / 10;
    totalWeight += w;
  }
  if (!sawCommunity) {
    const w = lookup.community_score;
    const raw = communityRaw(netVotes);
    total += (raw * w) / 10;
    totalWeight += w;
  }
  // Rescale so weights summing to anything still yield a 0–100 composite.
  return totalWeight > 0 ? Math.min(100, (total * 100) / totalWeight) : 0;
}

function communityRaw(net: number): number {
  if (net === 0) return 5;
  const mag = Math.log2(Math.abs(net) + 1);
  return net >= 0 ? Math.min(10, 5 + mag) : Math.max(0, 5 - mag);
}
