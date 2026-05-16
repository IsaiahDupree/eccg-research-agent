/**
 * Client-side cache for the Drive-persisted user uploads.
 * Mirrors the votes_client.ts pattern.
 */

"use client";

import { useEffect, useState } from "react";
import type { Paper, ScoredPaper } from "./models";

interface UploadedRecord {
  paper: Paper;
  score_base: number;
  uploaded_by: string;
  uploaded_at: string;
  source_file: string;
}

let cache: UploadedRecord[] | null = null;
let inflight: Promise<UploadedRecord[]> | null = null;
const SYNC_EVENT = "eccg-custom-corpus-sync";

async function ensureLoaded(): Promise<UploadedRecord[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/corpus/custom", { cache: "no-store" });
      const json = await res.json();
      cache = Array.isArray(json.records) ? json.records : [];
    } catch {
      cache = [];
    }
    return cache!;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function useCustomCorpus(): { records: UploadedRecord[]; loaded: boolean } {
  const [records, setRecords] = useState<UploadedRecord[]>(cache ?? []);
  const [loaded, setLoaded] = useState(cache !== null);
  useEffect(() => {
    let alive = true;
    ensureLoaded().then((list) => {
      if (!alive) return;
      setRecords([...list]);
      setLoaded(true);
    });
    function onSync() {
      setRecords([...(cache ?? [])]);
    }
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      alive = false;
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, []);
  return { records, loaded };
}

export function clearCustomCorpusCache() {
  cache = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  }
}

/** Adapt UploadedRecord → ScoredPaper for the list view. */
export function asScored(r: UploadedRecord): ScoredPaper {
  return {
    paper: r.paper,
    total: r.score_base,
    categories: [
      {
        name: "user_upload",
        weight: 100,
        raw: r.score_base / 10,
        rationale: `uploaded by ${r.uploaded_by} from ${r.source_file}`,
      },
    ],
  };
}
