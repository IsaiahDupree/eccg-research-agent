#!/usr/bin/env node
/**
 * Pull each top-scored paper's references from Semantic Scholar, intersect
 * with our corpus, and emit a paper→paper citation graph.
 *
 *   src/fixtures/eccg_citations.json
 *     { <paperId>: { cites: [<paperId>], cited_by: [<paperId>] } }
 *
 * Top-200 by score keeps the run under the anonymous S2 rate-limit budget
 * (~ 2-3 minutes total). Use --top=N to override.
 */

import { readFileSync, writeFileSync } from "node:fs";

const CORPUS_PATH = "src/fixtures/eccg_corpus.json";
const OUT_PATH = "src/fixtures/eccg_citations.json";
const S2_API = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "externalIds";   // minimum we need to match

const args = process.argv.slice(2);
function val(name, fb) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fb;
}
const TOP = Number(val("top", 200));
const MAX_REFS = Number(val("max-refs", 200));
const MAX_RETRIES = 4;

const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim();
const headers = {
  "User-Agent": "eccg-research-agent/1.0",
  ...(apiKey ? { "x-api-key": apiKey } : {}),
};

const log = (...x) => console.log(...x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── load corpus + build matchers ────────────────────────────────────────
log(`loading ${CORPUS_PATH}`);
const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
log(`  ${corpus.length} papers`);

const byS2 = new Map();
const byArxiv = new Map();
const byDoi = new Map();
for (const s of corpus) {
  const p = s.paper;
  if (p.s2_id) byS2.set(String(p.s2_id), p.id);
  if (p.arxiv_id) byArxiv.set(String(p.arxiv_id).toLowerCase(), p.id);
  if (p.doi) byDoi.set(String(p.doi).toLowerCase(), p.id);
}
log(`  matchers: ${byS2.size} S2 · ${byArxiv.size} arXiv · ${byDoi.size} DOI`);

// Pick top N by current rubric total
const ranked = [...corpus].sort((a, b) => b.total - a.total).slice(0, TOP);
log(`  fetching references for top ${ranked.length} papers`);

// ─── S2 references fetch ─────────────────────────────────────────────────
async function fetchRefs(paperId) {
  // Use the citation-graph reference endpoint with the paperId as parameter.
  // We accept any of the S2 native id, ARXIV:id, or DOI:id formats.
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const url = `${S2_API}/paper/${encodeURIComponent(paperId)}/references?fields=${FIELDS}&limit=${MAX_REFS}`;
    const r = await fetch(url, { headers });
    if (r.status === 200) {
      const j = await r.json();
      return j.data ?? [];
    }
    if (r.status === 429 && attempt < MAX_RETRIES) {
      const delay = 5000 * Math.pow(2, attempt);
      await sleep(delay);
      continue;
    }
    if (r.status === 404) return null;
    return null;
  }
  return null;
}

// We need the s2_id OR an alternate identifier for the lookup. Prefer s2,
// fall back to ARXIV:id, then DOI:id.
function lookupKey(p) {
  if (p.s2_id) return p.s2_id;
  if (p.arxiv_id) return `ARXIV:${p.arxiv_id}`;
  if (p.doi) return `DOI:${p.doi}`;
  return null;
}

function externalIdToCorpusId(externalIds) {
  if (!externalIds) return null;
  if (externalIds.ArXiv && byArxiv.has(String(externalIds.ArXiv).toLowerCase())) {
    return byArxiv.get(String(externalIds.ArXiv).toLowerCase());
  }
  if (externalIds.DOI && byDoi.has(String(externalIds.DOI).toLowerCase())) {
    return byDoi.get(String(externalIds.DOI).toLowerCase());
  }
  return null;
}

// ─── walk top-N papers ───────────────────────────────────────────────────
const graph = {};
let queried = 0;
let edgesAdded = 0;
let papersWithCorpusCites = 0;

for (let i = 0; i < ranked.length; i++) {
  const s = ranked[i];
  const p = s.paper;
  const key = lookupKey(p);
  if (!key) continue;
  queried++;
  const refs = await fetchRefs(key);
  if (refs == null) {
    if ((i + 1) % 25 === 0) log(`  ${i + 1}/${ranked.length} — ${edgesAdded} edges so far`);
    await sleep(apiKey ? 800 : 2500);
    continue;
  }
  const cites = [];
  for (const ref of refs) {
    const cited = ref.citedPaper ?? ref;
    const corpusId = externalIdToCorpusId(cited.externalIds);
    if (corpusId && corpusId !== p.id && !cites.includes(corpusId)) {
      cites.push(corpusId);
      // record reverse edge
      if (!graph[corpusId]) graph[corpusId] = { cites: [], cited_by: [] };
      if (!graph[corpusId].cited_by.includes(p.id)) {
        graph[corpusId].cited_by.push(p.id);
        edgesAdded++;
      }
    }
  }
  if (cites.length > 0) {
    if (!graph[p.id]) graph[p.id] = { cites: [], cited_by: [] };
    graph[p.id].cites = cites;
    papersWithCorpusCites++;
  }
  if ((i + 1) % 25 === 0) {
    log(
      `  ${i + 1}/${ranked.length} — ${queried} queried · ${papersWithCorpusCites} cite-in-corpus · ${edgesAdded} edges`,
    );
  }
  await sleep(apiKey ? 800 : 2500);
}

// ─── save ────────────────────────────────────────────────────────────────
writeFileSync(OUT_PATH, JSON.stringify(graph, null, 0));
log(`\n✅ wrote ${OUT_PATH}`);
log(`   nodes with edges: ${Object.keys(graph).length}`);
log(`   forward edges (cites):  ${papersWithCorpusCites}`);
log(`   reverse edges (cited):  ${edgesAdded}`);

// Top of the "cited-by" leaderboard — most-influential papers in this corpus
const ranked2 = Object.entries(graph)
  .map(([id, e]) => ({ id, in: e.cited_by.length, out: e.cites.length }))
  .sort((a, b) => b.in - a.in)
  .slice(0, 10);
log("\ntop in-corpus citation receivers:");
const titleById = new Map(corpus.map((s) => [s.paper.id, s.paper.title]));
for (const r of ranked2) {
  log(`  cited_by=${String(r.in).padStart(3)}  cites=${String(r.out).padStart(2)}  ${(titleById.get(r.id) ?? r.id).slice(0, 70)}`);
}
