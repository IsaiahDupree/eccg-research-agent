/**
 * Client-side votes cache. Single fetch of the bulk endpoint, shared across
 * all rendered PaperRow + VoteWidget components. Optimistic updates on cast.
 */

"use client";

import { useEffect, useState } from "react";
import { getIdentity } from "./identity";

export interface VoteTally {
  up: number;
  down: number;
  net: number;
  /** Editor-weighted net: editor votes count 2× via the API. */
  weighted_net?: number;
  /** Up/down votes cast by editors (subset of up/down). */
  editor_up?: number;
  editor_down?: number;
  /** Set client-side to remember this user's vote between renders. */
  my?: 1 | -1 | 0;
}

type VotesMap = Record<string, VoteTally>;

let cache: VotesMap | null = null;
let inflight: Promise<VotesMap> | null = null;
const myVotes = new Map<string, 1 | -1 | 0>(); // local memory of what we cast this session
const SYNC_EVENT = "eccg-votes-sync";

async function ensureLoaded(): Promise<VotesMap> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/votes", { cache: "no-store" });
      const json = await res.json();
      cache = (json.votes ?? {}) as VotesMap;
    } catch {
      cache = {};
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

export function useVotes(): { votes: VotesMap; loaded: boolean } {
  const [votes, setVotes] = useState<VotesMap>(cache ?? {});
  const [loaded, setLoaded] = useState(cache !== null);
  useEffect(() => {
    let alive = true;
    ensureLoaded().then((v) => {
      if (!alive) return;
      setVotes({ ...v });
      setLoaded(true);
    });
    function onSync() {
      setVotes({ ...(cache ?? {}) });
    }
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      alive = false;
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, []);
  return { votes, loaded };
}

export function getMyVote(paperId: string): 1 | -1 | 0 {
  return myVotes.get(paperId) ?? 0;
}

export async function castVote(
  paperId: string,
  next: 1 | -1 | 0,
  reason?: string,
): Promise<VoteTally | null> {
  const tally = cache?.[paperId] ?? { up: 0, down: 0, net: 0 };
  const prev = getMyVote(paperId);

  // Compute optimistic delta
  let up = tally.up;
  let down = tally.down;
  if (prev === 1) up--;
  if (prev === -1) down--;
  if (next === 1) up++;
  if (next === -1) down++;
  const optimistic: VoteTally = { up, down, net: up - down };
  cache = { ...(cache ?? {}), [paperId]: optimistic };
  myVotes.set(paperId, next);
  notify();

  try {
    const res = await fetch(`/api/votes/${encodeURIComponent(paperId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: next, reason, voter: getIdentity().alias }),
    });
    const json = await res.json();
    if (json.ok && json.votes) {
      const fresh: VoteTally = {
        up: json.votes.upvotes,
        down: json.votes.downvotes,
        net: json.votes.net,
      };
      cache = { ...(cache ?? {}), [paperId]: fresh };
      notify();
      return fresh;
    }
  } catch {
    // keep optimistic
  }
  return optimistic;
}

export function clearVotesCache() {
  cache = null;
  notify();
}

/**
 * Reddit-style hotness for research papers. Citation-decay is too slow at
 * Reddit's scale, so we use a softer denominator: 1 + months_since_publish/6.
 */
export function hotness(net: number, monthsOld: number): number {
  if (net === 0) return 0;
  const order = Math.log10(Math.max(Math.abs(net), 1));
  const sign = net > 0 ? 1 : -1;
  return sign * order - monthsOld / 36;
}

/** Map net votes → 0–10 raw axis for the rubric breakdown. */
export function netToRubricRaw(net: number): number {
  // 0 votes → 5 (neutral). log scale on either side.
  const mag = Math.log2(Math.abs(net) + 1);   // 0→0, 1→1, 3→2, 7→3, 15→4
  if (net >= 0) return Math.min(10, 5 + mag);
  return Math.max(0, 5 - mag);
}
