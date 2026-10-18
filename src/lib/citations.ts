/**
 * In-corpus citation graph (with citation-intent metadata).
 *
 * Built offline by `scripts/backfill-citations-graph.mjs` and shipped as a
 * static fixture. Each edge carries the S2 `intents` array — values are
 * one of: "background" | "methodology" | "result" | "extensionMethodology".
 *
 * "methodology", "result", and "extensionMethodology" are the
 * replication-strength signal Alexis asked for — they mean the citing
 * paper actually built on / compared against the cited work, not just
 * named it in the lit review.
 */

import index from "../fixtures/eccg_citations.json" with { type: "json" };

export type CitationIntent = "background" | "methodology" | "result" | "extensionMethodology";

export interface CitationEdge {
  id: string;
  intents: CitationIntent[];
}

export interface CitationEdges {
  cites: CitationEdge[];
  cited_by: CitationEdge[];
}

const graph = index as Record<string, CitationEdges>;
const EMPTY: CitationEdges = { cites: [], cited_by: [] };

const REPLICATION_INTENTS = new Set<CitationIntent>([
  "methodology",
  "result",
  "extensionMethodology",
]);

export function getCitationEdges(paperId: string): CitationEdges {
  return graph[paperId] ?? EMPTY;
}

export function getCitedByCount(paperId: string): number {
  return graph[paperId]?.cited_by.length ?? 0;
}

export function getCitesCount(paperId: string): number {
  return graph[paperId]?.cites.length ?? 0;
}

export function isReplicationIntent(intent: string): boolean {
  return REPLICATION_INTENTS.has(intent as CitationIntent);
}

/** Number of cited_by edges that carry a replication-strength intent. */
export function getReplicationCount(paperId: string): number {
  const e = graph[paperId];
  if (!e) return 0;
  return e.cited_by.filter((c) => c.intents.some(isReplicationIntent)).length;
}

export interface IntentCounts {
  background: number;
  methodology: number;
  result: number;
  extensionMethodology: number;
  /** total cited_by edges, regardless of intent (or with no intent label) */
  total: number;
  /** count of edges carrying at least one replication-strength intent */
  replication: number;
}

export function getIntentCounts(paperId: string): IntentCounts {
  const e = graph[paperId];
  const out: IntentCounts = {
    background: 0,
    methodology: 0,
    result: 0,
    extensionMethodology: 0,
    total: 0,
    replication: 0,
  };
  if (!e) return out;
  out.total = e.cited_by.length;
  for (const c of e.cited_by) {
    let isRepl = false;
    for (const i of c.intents) {
      if (i in out) (out as unknown as Record<string, number>)[i]++;
      if (isReplicationIntent(i)) isRepl = true;
    }
    if (isRepl) out.replication++;
  }
  return out;
}

/** All paper ids that have at least one in-corpus citation edge. */
export function getCitedPaperIds(): string[] {
  return Object.keys(graph).filter(
    (id) => (graph[id]?.cited_by.length ?? 0) > 0,
  );
}
