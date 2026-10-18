#!/usr/bin/env node
/**
 * Recompute the static rubric score for every paper in eccg_corpus.json
 * after the citation graph has been refreshed. Walks the citations
 * fixture, sets `paper.in_corpus_cited_by` + `paper.in_corpus_replication`
 * on each Paper, then patches the categories array with the new
 * `citation_graph` axis (and a tweaked citation_velocity / author_signal /
 * community_score weighting).
 */

import { readFileSync, writeFileSync } from "node:fs";

const CORPUS_PATH = "src/fixtures/eccg_corpus.json";
const CITATIONS_PATH = "src/fixtures/eccg_citations.json";

const REPL_INTENTS = new Set(["methodology", "result", "extensionMethodology"]);

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
const citations = JSON.parse(readFileSync(CITATIONS_PATH, "utf-8"));

// Annotate each paper with cited-by counts
let papersWithCitations = 0;
for (const s of corpus) {
  const edges = citations[s.paper.id];
  const total = edges?.cited_by?.length ?? 0;
  let repl = 0;
  if (edges?.cited_by?.length) {
    for (const e of edges.cited_by) {
      if ((e.intents ?? []).some((i) => REPL_INTENTS.has(i))) repl++;
    }
  }
  s.paper.in_corpus_cited_by = total;
  s.paper.in_corpus_replication = repl;
  if (total > 0) papersWithCitations++;
}

// New weights — must match DEFAULT_RUBRIC in src/lib/scoring/weights.ts.
const WEIGHTS = {
  citation_velocity: 13,
  eccg_relevance: 22,
  code_availability: 12,
  novelty: 12,
  venue_prestige: 8,
  author_signal: 6,
  recency: 5,
  community_score: 12,
  citation_graph: 10,
};
const totalCheck = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (totalCheck !== 100) {
  throw new Error(`Weights must sum to 100; got ${totalCheck}`);
}

const TIER1 = /\b(CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|TPAMI|IJCV|TRO|RAL|ICRA|IROS)\b/i;
const TIER2 = /\b(BMVC|WACV|3DV|AAAI|IJCAI|TIP|TCSVT|ACCV|TVCG)\b/i;

function venuePrestigeRaw(name) {
  if (!name) return 3;
  if (TIER1.test(name)) return 9;
  if (TIER2.test(name)) return 7;
  return 4;
}

function citationGraphRaw(p) {
  const total = p.in_corpus_cited_by ?? 0;
  const repl = p.in_corpus_replication ?? 0;
  if (total === 0) return 0;
  return Math.min(10, Math.log2(total + repl + 1));
}

// Walk corpus, replace categories arr + total
let recomputed = 0;
for (const s of corpus) {
  const p = s.paper;
  // Existing per-paper raw values for axes we want to preserve
  const existingByName = Object.fromEntries(s.categories.map((c) => [c.name, c]));

  const nextCats = [];
  for (const [name, weight] of Object.entries(WEIGHTS)) {
    if (name === "citation_graph") {
      const total = p.in_corpus_cited_by ?? 0;
      const repl = p.in_corpus_replication ?? 0;
      nextCats.push({
        name,
        weight,
        raw: citationGraphRaw(p),
        rationale:
          total === 0
            ? "no in-corpus citations yet"
            : `cited by ${total} corpus paper${total === 1 ? "" : "s"}${repl > 0 ? `, ${repl} as methodology/result` : ""}`,
      });
      continue;
    }
    if (name === "venue_prestige") {
      nextCats.push({
        name,
        weight,
        raw: venuePrestigeRaw(p.venue?.name),
        rationale: `venue: ${p.venue?.name || "unknown"}`,
      });
      continue;
    }
    if (name === "community_score") {
      nextCats.push({
        name,
        weight,
        raw: 5,
        rationale: "neutral until votes are cast",
      });
      continue;
    }
    const ex = existingByName[name];
    nextCats.push({
      name,
      weight,
      raw: ex?.raw ?? 0,
      rationale: ex?.rationale ?? "—",
    });
  }
  s.categories = nextCats;
  s.total = nextCats.reduce((acc, c) => acc + (c.raw * c.weight) / 10, 0);
  recomputed++;
}

corpus.sort((a, b) => b.total - a.total);
writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 0));

console.log(`✅ rescored ${recomputed} papers`);
console.log(`   ${papersWithCitations} carry an in-corpus citation edge`);
console.log(`\nnew top 10 by composite score:`);
for (const s of corpus.slice(0, 10)) {
  console.log(
    `  ${s.total.toFixed(0).padStart(3)} | cit ${String(s.paper.citation_count).padStart(4)} | in ${String(s.paper.in_corpus_cited_by ?? 0).padStart(3)} | ${(s.paper.eccg_category ?? "?").padEnd(20)} | ${s.paper.title.slice(0, 55)}`,
  );
}
