/**
 * Client-side hook for the shared team library.
 *
 * Fetches once on first use and caches in a module-scope set. Subscribers
 * are notified via a tiny custom event when the cache changes. Falls back
 * to no-op state when the API is unavailable.
 */

"use client";

import { useEffect, useState } from "react";
import { getIdentity } from "./identity";

export type ReadingStatus = "to_read" | "reading" | "read";

export interface LibraryItem {
  paper_id: string;
  added_by: string;
  added_at: string;
  tags?: string[];
  reading_status?: ReadingStatus;
  status_updated_at?: string;
}

let cache: LibraryItem[] | null = null;
let inflight: Promise<LibraryItem[]> | null = null;
const SYNC_EVENT = "eccg-library-sync";

async function ensureLoaded(): Promise<LibraryItem[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/library", { cache: "no-store" });
      const json = await res.json();
      cache = Array.isArray(json.library) ? json.library : [];
    } catch {
      cache = [];
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

export function useLibrary(): { items: LibraryItem[]; loaded: boolean } {
  const [items, setItems] = useState<LibraryItem[]>(cache ?? []);
  const [loaded, setLoaded] = useState<boolean>(cache !== null);
  useEffect(() => {
    let alive = true;
    ensureLoaded().then((list) => {
      if (!alive) return;
      setItems(list);
      setLoaded(true);
    });
    function onSync() {
      setItems(cache ?? []);
    }
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      alive = false;
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, []);
  return { items, loaded };
}

export async function toggleLibrary(paperId: string): Promise<boolean> {
  const current = cache ?? (await ensureLoaded());
  const isSaved = current.some((i) => i.paper_id === paperId);
  const action = isSaved ? "remove" : "add";
  // Optimistic update
  if (isSaved) cache = current.filter((i) => i.paper_id !== paperId);
  else
    cache = [
      { paper_id: paperId, added_by: getIdentity().alias, added_at: new Date().toISOString() },
      ...current,
    ];
  notify();
  try {
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, paper_id: paperId, user: getIdentity().alias }),
    });
    const json = await res.json();
    if (json.ok && Array.isArray(json.library)) {
      cache = json.library;
      notify();
    }
  } catch {
    // network failure — keep optimistic state, will reconcile on next load
  }
  return !isSaved;
}

export function clearLibraryCache() {
  cache = null;
  notify();
}

/**
 * Update tags and/or reading_status for an already-saved paper. Returns
 * the new state of the library, or null when the paper isn't in the
 * library yet. Optimistic — applies locally first, then reconciles with
 * the server response.
 */
export async function updateLibraryEntry(
  paperId: string,
  patch: { tags?: string[]; reading_status?: ReadingStatus },
): Promise<LibraryItem | null> {
  const current = cache ?? (await ensureLoaded());
  const idx = current.findIndex((i) => i.paper_id === paperId);
  if (idx < 0) return null;
  const optimistic: LibraryItem = {
    ...current[idx],
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    ...(patch.reading_status !== undefined
      ? {
          reading_status: patch.reading_status,
          status_updated_at: new Date().toISOString(),
        }
      : {}),
  };
  cache = [...current];
  cache[idx] = optimistic;
  notify();
  try {
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "update",
        paper_id: paperId,
        user: getIdentity().alias,
        ...patch,
      }),
    });
    const json = await res.json();
    if (json.ok && Array.isArray(json.library)) {
      cache = json.library;
      notify();
      return json.library.find((i: LibraryItem) => i.paper_id === paperId) ?? null;
    }
  } catch {
    /* keep optimistic */
  }
  return optimistic;
}
