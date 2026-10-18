/**
 * Author-page aggregate statistics.
 *
 * Pulled out of /author/[name]/page.tsx so the math is testable independent
 * of Next.js routing. The citation-intent counter is injected so tests can
 * pass any IntentCounts source (the real one reads eccg_citations.json;
 * tests pass synthetic counts).
 */

import type { IntentCounts } from "./citations";
import type { ScoredPaper } from "./models";

export interface AuthorStats {
  papers_count: number;
  citations_total: number;
  h_index_proxy: number;
  /** sum of cited_by edges into this author's papers (any intent) */
  in_corpus_cited_by: number;
  /** methodology + result + extensionMethodology — "X built on this" */
  replication_total: number;
  background_total: number;
  papers_with_replication: number;
  top_venues: [string, number][];
  top_categories: [string, number][];
  top_collaborators: [string, number][];
  /** paper id → intent breakdown */
  intent_by_paper: Map<string, IntentCounts>;
  most_replicated_paper_id: string | null;
}

export function normaliseAuthor(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
}

export interface AuthorStatsOpts {
  /** Optional caps for top-K lists. Defaults: 4/4/8. */
  top_venues_cap?: number;
  top_categories_cap?: number;
  top_collaborators_cap?: number;
  /** Minimum joint-paper count for a co-author to land on the list. */
  min_collaborator_count?: number;
}

export function computeAuthorStats(
  authorName: string,
  allPapers: ScoredPaper[],
  intentCounter: (paperId: string) => IntentCounts,
  opts: AuthorStatsOpts = {},
): AuthorStats {
  const target = normaliseAuthor(authorName);
  const {
    top_venues_cap = 4,
    top_categories_cap = 4,
    top_collaborators_cap = 8,
    min_collaborator_count = 2,
  } = opts;

  const papers = allPapers.filter((s) =>
    s.paper.authors.some((a) => normaliseAuthor(a.name) === target),
  );

  const venues = new Map<string, number>();
  const categories = new Map<string, number>();
  let citations_total = 0;
  let in_corpus_cited_by = 0;
  let replication_total = 0;
  let background_total = 0;
  let papers_with_replication = 0;
  const intent_by_paper = new Map<string, IntentCounts>();
  let most_replicated_paper_id: string | null = null;
  let most_replicated_count = 0;

  for (const s of papers) {
    const v = s.paper.venue?.name ?? "preprint";
    venues.set(v, (venues.get(v) ?? 0) + 1);
    const c = s.paper.eccg_category ?? "unclassified";
    categories.set(c, (categories.get(c) ?? 0) + 1);
    citations_total += s.paper.citation_count;
    const ic = intentCounter(s.paper.id);
    intent_by_paper.set(s.paper.id, ic);
    in_corpus_cited_by += ic.total;
    replication_total += ic.methodology + ic.result + ic.extensionMethodology;
    background_total += ic.background;
    if (ic.replication > 0) papers_with_replication++;
    if (ic.replication > most_replicated_count) {
      most_replicated_count = ic.replication;
      most_replicated_paper_id = s.paper.id;
    }
  }

  // Top venues / categories
  const top_venues = Array.from(venues.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, top_venues_cap);
  const top_categories = Array.from(categories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, top_categories_cap);

  // Collaborators: co-authors with ≥ min_collaborator_count joint papers
  const collab_counts = new Map<string, number>();
  for (const s of papers) {
    for (const a of s.paper.authors) {
      if (normaliseAuthor(a.name) === target) continue;
      collab_counts.set(a.name, (collab_counts.get(a.name) ?? 0) + 1);
    }
  }
  const top_collaborators = Array.from(collab_counts.entries())
    .filter(([, c]) => c >= min_collaborator_count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top_collaborators_cap);

  // h-index proxy: max h such that the author has h papers with ≥ h citations each.
  const h_index_proxy = papers
    .map((s) => s.paper.citation_count)
    .sort((a, b) => b - a)
    .filter((c, i) => c >= i + 1).length;

  return {
    papers_count: papers.length,
    citations_total,
    h_index_proxy,
    in_corpus_cited_by,
    replication_total,
    background_total,
    papers_with_replication,
    top_venues,
    top_categories,
    top_collaborators,
    intent_by_paper,
    most_replicated_paper_id,
  };
}
