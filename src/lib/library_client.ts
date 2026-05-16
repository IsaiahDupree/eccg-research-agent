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

interface LibraryItem {
  paper_id: string;
  added_by: string;
  added_at: string;
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
