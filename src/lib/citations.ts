/**
 * In-corpus citation graph. Built offline by
 * `scripts/backfill-citations-graph.mjs` and shipped as a static fixture.
 *
 *   eccg_citations.json:
 *     { <paperId>: { cites: [<paperId>], cited_by: [<paperId>] } }
 */

import index from "../fixtures/eccg_citations.json" with { type: "json" };

interface Edge {
  cites: string[];
  cited_by: string[];
}

const graph = index as Record<string, Edge>;

const EMPTY: Edge = { cites: [], cited_by: [] };

export function getCitationEdges(paperId: string): Edge {
  return graph[paperId] ?? EMPTY;
}

export function getCitedByCount(paperId: string): number {
  return graph[paperId]?.cited_by.length ?? 0;
}

export function getCitesCount(paperId: string): number {
  return graph[paperId]?.cites.length ?? 0;
}
