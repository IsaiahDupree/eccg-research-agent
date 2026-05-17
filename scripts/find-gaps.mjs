#!/usr/bin/env node
/**
 * Find papers our corpus references that AREN'T in our corpus — i.e. the
 * gaps in our coverage.
 *
 *   1. Walk every top-scored paper's S2 references.
 *   2. For each reference, check whether its arXiv id / DOI / S2 id is
 *      already in the corpus.
 *   3. For references that ARE NOT in the corpus, tally how many corpus
 *      papers reference it (frequency).
 *   4. Hydrate the missing papers with title + abstract via S2 batch.
 *   5. Save the top-N gaps to src/fixtures/eccg_gaps.json so /gaps can
 *      render them with an "ingest" call-to-action.
 */

import { readFileSync, writeFileSync } from "node:fs";

const CORPUS_PATH = "src/fixtures/eccg_corpus.json";
const OUT_PATH = "src/fixtures/eccg_gaps.json";
const S2_API = "https://api.semanticscholar.org/graph/v1";
const REF_FIELDS = "intents,citedPaper.externalIds,citedPaper.paperId";

const args = process.argv.slice(2);
function val(name, fb) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fb;
}
const TOP_CORPUS = Number(val("top", 200));
const MAX_GAPS = Number(val("limit", 150));
const MIN_FREQ = Number(val("min-freq", 2));
const MAX_RETRIES = 4;

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

// Build matchers for in-corpus lookup
const inCorpus = new Set();
for (const s of corpus) {
  if (s.paper.s2_id) inCorpus.add(`S2:${String(s.paper.s2_id)}`);
  if (s.paper.arxiv_id) inCorpus.add(`ARX:${String(s.paper.arxiv_id).toLowerCase()}`);
  if (s.paper.doi) inCorpus.add(`DOI:${String(s.paper.doi).toLowerCase()}`);
}
log(`  inCorpus matchers: ${inCorpus.size}`);

function lookupKey(p) {
  if (p.s2_id) return p.s2_id;
  if (p.arxiv_id) return `ARXIV:${p.arxiv_id}`;
  if (p.doi) return `DOI:${p.doi}`;
  return null;
}

function refKeyAndId(externalIds, s2Id) {
  // Returns [matchKey, canonicalId] where matchKey is what we'd put in
  // inCorpus and canonicalId is a stable string for tallying.
  if (externalIds?.ArXiv) {
    const v = String(externalIds.ArXiv).toLowerCase();
    return [`ARX:${v}`, `arxiv:${v}`];
  }
  if (externalIds?.DOI) {
    const v = String(externalIds.DOI).toLowerCase();
    return [`DOI:${v}`, `doi:${v}`];
  }
  if (s2Id) return [`S2:${s2Id}`, `s2:${s2Id}`];
  return [null, null];
}

async function fetchRefs(key) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const url = `${S2_API}/paper/${encodeURIComponent(key)}/references?fields=${REF_FIELDS}&limit=200`;
    const r = await fetch(url, { headers });
    if (r.status === 200) return ((await r.json()).data ?? []);
    if (r.status === 429 && attempt < MAX_RETRIES) {
      await sleep(5000 * Math.pow(2, attempt));
      continue;
    }
    return null;
  }
  return null;
}

// ─── walk top-N corpus papers ──────────────────────────────────────────
const ranked = [...corpus].sort((a, b) => b.total - a.total).slice(0, TOP_CORPUS);
log(`  walking references of top ${ranked.length} papers`);

const tally = new Map(); // canonicalId → { freq, ref_count, sources: Set<paperId>, externalIds, s2Id }
let queried = 0;

for (let i = 0; i < ranked.length; i++) {
  const p = ranked[i].paper;
  const key = lookupKey(p);
  if (!key) continue;
  queried++;
  const refs = await fetchRefs(key);
  if (refs == null) {
    await sleep(apiKey ? 800 : 2500);
    continue;
  }
  for (const ref of refs) {
    const cited = ref.citedPaper ?? ref;
    const [matchKey, canon] = refKeyAndId(cited.externalIds, cited.paperId);
    if (!matchKey || !canon) continue;
    if (inCorpus.has(matchKey)) continue; // already have it
    const existing = tally.get(canon);
    if (existing) {
      existing.sources.add(p.id);
    } else {
      tally.set(canon, {
        canonicalId: canon,
        externalIds: cited.externalIds ?? {},
        s2Id: cited.paperId ?? null,
        sources: new Set([p.id]),
      });
    }
  }
  if ((i + 1) % 25 === 0) log(`  ${i + 1}/${ranked.length}  tally:${tally.size}`);
  await sleep(apiKey ? 800 : 2500);
}

log(`\n  ${tally.size} unique external references`);

// Filter to gaps that show up in at least MIN_FREQ corpus papers
const candidates = Array.from(tally.values())
  .filter((g) => g.sources.size >= MIN_FREQ)
  .sort((a, b) => b.sources.size - a.sources.size)
  .slice(0, MAX_GAPS);
log(`  ${candidates.length} gaps with freq ≥ ${MIN_FREQ}`);

// ─── hydrate gap metadata from S2 batch ────────────────────────────────
log(`\n  hydrating metadata via S2 batch …`);
const META_FIELDS = "paperId,title,year,abstract,authors.name,venue,externalIds";
const ids = candidates.map((c) => c.s2Id).filter(Boolean);
const metaBySid = new Map();
const BATCH = 200;
for (let i = 0; i < ids.length; i += BATCH) {
  const slice = ids.slice(i, i + BATCH);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const r = await fetch(`${S2_API}/paper/batch?fields=${META_FIELDS}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ ids: slice }),
    });
    if (r.status === 200) {
      const body = await r.json();
      for (let k = 0; k < body.length; k++) {
        const item = body[k];
        if (item?.paperId) metaBySid.set(item.paperId, item);
      }
      break;
    }
    if (r.status === 429 && attempt < MAX_RETRIES) {
      await sleep(5000 * Math.pow(2, attempt));
      continue;
    }
    log(`    batch failed: ${r.status}`);
    break;
  }
  await sleep(apiKey ? 1000 : 3000);
}

// ─── shape output ──────────────────────────────────────────────────────
const out = candidates.map((g) => {
  const meta = g.s2Id ? metaBySid.get(g.s2Id) : null;
  const arxivId = g.externalIds.ArXiv ?? meta?.externalIds?.ArXiv;
  const doi = g.externalIds.DOI ?? meta?.externalIds?.DOI;
  return {
    canonical_id: g.canonicalId,
    s2_id: g.s2Id ?? null,
    arxiv_id: arxivId ?? null,
    doi: doi ?? null,
    title: meta?.title ?? null,
    abstract: meta?.abstract ?? null,
    authors: meta?.authors?.map((a) => a.name) ?? [],
    year: meta?.year ?? null,
    venue: meta?.venue ?? null,
    referenced_by_count: g.sources.size,
    referenced_by: Array.from(g.sources).slice(0, 12),
    html_url: arxivId
      ? `https://arxiv.org/abs/${arxivId}`
      : doi
        ? `https://doi.org/${doi}`
        : g.s2Id
          ? `https://www.semanticscholar.org/paper/${g.s2Id}`
          : null,
  };
});

writeFileSync(OUT_PATH, JSON.stringify(out, null, 0));
log(`\n✅ wrote ${OUT_PATH}`);
log(`   ${out.length} gap candidates`);
log(`\ntop 10 missing papers (by corpus reference count):`);
for (const g of out.slice(0, 10)) {
  log(`  refs ${String(g.referenced_by_count).padStart(3)}  ${(g.title ?? "(no metadata)").slice(0, 65)}`);
}
