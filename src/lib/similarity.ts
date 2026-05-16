/**
 * Similarity / relationship engine.
 *
 * The TF-IDF top-K neighbours are precomputed offline in
 * `scripts/ingest-spreadsheet.mjs` and shipped at
 * `src/fixtures/eccg_similarities.json`. This module just exposes lookups.
 */

import similarityIndex from "../fixtures/eccg_similarities.json" with { type: "json" };

type SimilarityEntry = { id: string; sim: number };
type SimilarityIndex = Record<string, SimilarityEntry[]>;

const index = similarityIndex as SimilarityIndex;

export function getNeighbors(paperId: string, k = 5): SimilarityEntry[] {
  return (index[paperId] ?? []).slice(0, k);
}

export function getSimilarity(a: string, b: string): number | null {
  const entry = (index[a] ?? []).find((e) => e.id === b);
  return entry?.sim ?? null;
}

/** Same neighbours, but excluding any ids already in `exclude`. */
export function getNeighborsFiltered(
  paperId: string,
  exclude: Set<string>,
  k = 5,
): SimilarityEntry[] {
  return (index[paperId] ?? []).filter((e) => !exclude.has(e.id)).slice(0, k);
}
