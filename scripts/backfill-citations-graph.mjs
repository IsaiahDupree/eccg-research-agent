#!/usr/bin/env node
/**
 * Pull each top-scored paper's references from Semantic Scholar with the
 * citation-intent metadata, intersect with our corpus, and emit a
 * paper→paper citation graph annotated by intent.
 *
 *   src/fixtures/eccg_citations.json
 *     {
 *       <paperId>: {
 *         cites:    [{ id, intents: [...] }],
 *         cited_by: [{ id, intents: [...] }]
 *       }
 *     }
 *
 * S2 intent values: "background" | "methodology" | "result" |
 * "extensionMethodology". Papers cited for "methodology" or "result" are
 * the replication-strength signal Alexis asked for; "background" is
 * weaker (the paper was named in the lit review but not built on).
 *
 * Top-200 by score keeps the run under the anonymous S2 rate-limit
 * (~ 3-5 minutes). Use --top=N to override.
 */

import { readFileSync, writeFileSync } from "node:fs";

const CORPUS_PATH = "src/fixtures/eccg_corpus.json";
const OUT_PATH = "src/fixtures/eccg_citations.json";
const S2_API = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "intents,citedPaper.externalIds";
const MAX_RETRIES = 4;

const args = process.argv.slice(2);
function val(name, fb) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fb;
}
const TOP = Number(val("top", 200));
const MAX_REFS = Number(val("max-refs", 200));

const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim();
const headers = {
  "User-Agent": "eccg-research-agent/1.0",
  ...(apiKey ? { "x-api-key": apiKey } : {}),
};

const log = (...x) => console.log(...x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

log(`loading ${CORPUS_PATH}`);
const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
log(`  ${corpus.length} papers`);

const byArxiv = new Map();
const byDoi = new Map();
for (const s of corpus) {
  const p = s.paper;
  if (p.arxiv_id) byArxiv.set(String(p.arxiv_id).toLowerCase(), p.id);
  if (p.doi) byDoi.set(String(p.doi).toLowerCase(), p.id);
}
log(`  matchers: ${byArxiv.size} arXiv · ${byDoi.size} DOI`);

const ranked = [...corpus].sort((a, b) => b.total - a.total).slice(0, TOP);
log(`  fetching references for top ${ranked.length} papers with intents`);

async function fetchRefs(paperId) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const url = `${S2_API}/paper/${encodeURIComponent(paperId)}/references?fields=${FIELDS}&limit=${MAX_REFS}`;
    const r = await fetch(url, { headers });
    if (r.status === 200) {
      const j = await r.json();
      return j.data ?? [];
    }
    if (r.status === 429 && attempt < MAX_RETRIES) {
      await sleep(5000 * Math.pow(2, attempt));
      continue;
    }
    return null;
  }
  return null;
}

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

const graph = {};
let papersWithCorpusCites = 0;
let edgesAdded = 0;

for (let i = 0; i < ranked.length; i++) {
  const p = ranked[i].paper;
  const key = lookupKey(p);
  if (!key) continue;
  const refs = await fetchRefs(key);
  if (refs == null) {
    await sleep(apiKey ? 800 : 2500);
    continue;
  }
  const cites = [];
  const seen = new Set();
  for (const ref of refs) {
    const cited = ref.citedPaper ?? ref;
    const intents = Array.isArray(ref.intents) ? ref.intents.map(String) : [];
    const corpusId = externalIdToCorpusId(cited.externalIds);
    if (!corpusId || corpusId === p.id || seen.has(corpusId)) continue;
    seen.add(corpusId);
    cites.push({ id: corpusId, intents });
    if (!graph[corpusId]) graph[corpusId] = { cites: [], cited_by: [] };
    const existing = graph[corpusId].cited_by.find((e) => e.id === p.id);
    if (existing) {
      for (const x of intents) if (!existing.intents.includes(x)) existing.intents.push(x);
    } else {
      graph[corpusId].cited_by.push({ id: p.id, intents: [...intents] });
      edgesAdded++;
    }
  }
  if (cites.length > 0) {
    if (!graph[p.id]) graph[p.id] = { cites: [], cited_by: [] };
    graph[p.id].cites = cites;
    papersWithCorpusCites++;
  }
  if ((i + 1) % 25 === 0) {
    log(`  ${i + 1}/${ranked.length} — ${papersWithCorpusCites} cite-in-corpus · ${edgesAdded} edges`);
  }
  await sleep(apiKey ? 800 : 2500);
}

writeFileSync(OUT_PATH, JSON.stringify(graph, null, 0));
log(`\nwrote ${OUT_PATH}`);
log(`  nodes with edges: ${Object.keys(graph).length}`);
log(`  forward edges (cites):  ${papersWithCorpusCites}`);
log(`  reverse edges (cited):  ${edgesAdded}`);

const intentCounts = {};
for (const e of Object.values(graph)) {
  for (const c of e.cited_by) {
    for (const i of c.intents) intentCounts[i] = (intentCounts[i] || 0) + 1;
  }
}
log(`\nintent breakdown:`);
for (const [intent, n] of Object.entries(intentCounts).sort((a, b) => b[1] - a[1])) {
  log(`  ${String(n).padStart(5)}  ${intent}`);
}

function strength(edges) {
  return edges.filter((e) =>
    e.intents.some((i) => i === "methodology" || i === "result" || i === "extensionMethodology"),
  ).length;
}
const ranked2 = Object.entries(graph)
  .map(([id, e]) => ({
    id,
    inAll: e.cited_by.length,
    inReplication: strength(e.cited_by),
  }))
  .sort((a, b) => b.inAll - a.inAll)
  .slice(0, 10);
const titleById = new Map(corpus.map((s) => [s.paper.id, s.paper.title]));
log(`\ntop in-corpus citation receivers (all · replication-strength):`);
for (const r of ranked2) {
  log(`  in=${String(r.inAll).padStart(3)}  repl=${String(r.inReplication).padStart(3)}  ${(titleById.get(r.id) ?? r.id).slice(0, 60)}`);
}
