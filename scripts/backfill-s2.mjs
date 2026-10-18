#!/usr/bin/env node
/**
 * Hydrate the existing eccg_corpus.json with Semantic Scholar citation data.
 *
 *   - Loads scored corpus.
 *   - Batches arXiv ids through the S2 /paper/batch endpoint (200 at a time).
 *   - Retries with exponential backoff on 429.
 *   - Patches citation_count, influential_citation_count, venue, h-index.
 *   - Re-scores every paper with the existing rubric.
 *   - Saves back to eccg_corpus.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const CORPUS_PATH = "src/fixtures/eccg_corpus.json";
const BATCH = 200;
const FIELDS = "paperId,externalIds,citationCount,influentialCitationCount,publicationVenue,authors.name,authors.hIndex";
const MAX_RETRIES = 4;

const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim();
const headers = {
  "Content-Type": "application/json",
  "User-Agent": "eccg-research-agent/1.0",
  ...(apiKey ? { "x-api-key": apiKey } : {}),
};

console.log(`loading ${CORPUS_PATH} …`);
const scored = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
console.log(`  ${scored.length} papers loaded`);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function s2Batch(arxivIds) {
  const body = JSON.stringify({ ids: arxivIds.map((id) => `ARXIV:${id}`) });
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/batch?fields=${FIELDS}`,
      { method: "POST", headers, body },
    );
    if (res.status === 200) return await res.json();
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const delay = 10_000 * Math.pow(2, attempt); // 10s, 20s, 40s, 80s
      console.log(`    429 — back off ${delay / 1000}s (attempt ${attempt + 1})`);
      await sleep(delay);
      continue;
    }
    throw new Error(`S2 batch ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error("S2 batch exhausted retries");
}

const byArxiv = new Map();
for (const s of scored) {
  if (s.paper.arxiv_id) byArxiv.set(s.paper.arxiv_id, s);
}
const allArxivIds = Array.from(byArxiv.keys());
console.log(`  ${allArxivIds.length} papers have arXiv ids`);
console.log(`\nhydrating via S2 (batch ${BATCH}, ${apiKey ? "with key" : "anonymous"}) …`);

let hydrated = 0;
let venuePromoted = 0;
let hIndexPatched = 0;
for (let i = 0; i < allArxivIds.length; i += BATCH) {
  const slice = allArxivIds.slice(i, i + BATCH);
  let body;
  try {
    body = await s2Batch(slice);
  } catch (err) {
    console.log(`  batch ${Math.floor(i / BATCH) + 1} FAILED: ${err.message}`);
    await sleep(5000);
    continue;
  }
  for (let j = 0; j < body.length; j++) {
    const item = body[j];
    if (!item || !item.paperId) continue;
    const s = byArxiv.get(slice[j]);
    if (!s) continue;
    const p = s.paper;
    p.s2_id = item.paperId;
    p.doi = item.externalIds?.DOI ?? p.doi;
    p.citation_count = item.citationCount ?? 0;
    p.influential_citation_count = item.influentialCitationCount;
    if (p.months_since_publish > 0) {
      p.citations_per_month = p.citation_count / p.months_since_publish;
    }
    if (item.publicationVenue?.name && p.venue?.type === "preprint") {
      const name = item.publicationVenue.name;
      p.venue = {
        name,
        type: /CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|ICRA|IROS|BMVC|WACV|AAAI|IJCAI/i.test(name)
          ? "conference"
          : /TPAMI|RAL|TRO|IJCV|TIP|TVCG/i.test(name)
            ? "journal"
            : "unknown",
      };
      venuePromoted++;
    }
    if (item.authors?.length && p.authors.length) {
      const byName = new Map(item.authors.map((a) => [a.name, a.hIndex]));
      let patched = false;
      p.authors = p.authors.map((a) => {
        const h = byName.get(a.name);
        if (h && !a.h_index) patched = true;
        return { ...a, h_index: h ?? a.h_index };
      });
      if (patched) hIndexPatched++;
    }
    hydrated++;
  }
  console.log(
    `  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(allArxivIds.length / BATCH)} → ${body.length} items, cumulative ${hydrated} hydrated`,
  );
  // Be polite even when successful
  await sleep(apiKey ? 1000 : 5000);
}

// Re-score every paper with the existing rubric
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

console.log("\nre-scoring corpus …");
const allPapers = scored.map((s) => s.paper);
const byVenue = new Map();
for (const p of allPapers) {
  const v = p.venue?.name ?? "unknown";
  if (!byVenue.has(v)) byVenue.set(v, []);
  byVenue.get(v).push(p.citations_per_month);
}
const corpusBaseline = median(allPapers.map((p) => p.citations_per_month).filter((x) => x > 0)) || 0.05;
const venueBaseline = new Map();
for (const [v, arr] of byVenue) venueBaseline.set(v, median(arr));

const tier1 = /\b(CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|TPAMI|IJCV|TRO|RAL|ICRA|IROS)\b/i;
const tier2 = /\b(BMVC|WACV|3DV|AAAI|IJCAI|TIP|TCSVT|ACCV|TVCG)\b/i;

for (const s of scored) {
  const p = s.paper;
  const venue = p.venue?.name ?? "unknown";
  const base =
    (byVenue.get(venue)?.length ?? 0) >= 3
      ? venueBaseline.get(venue) || corpusBaseline
      : corpusBaseline;
  const mult = p.citations_per_month / Math.max(0.01, base);
  // Patch existing categories array in-place
  const cats = s.categories;
  for (const c of cats) {
    if (c.name === "citation_velocity") {
      c.raw = mult <= 0 ? 0 : Math.min(10, 5 + 2 * Math.log2(mult + 1));
      c.rationale = `${p.citations_per_month.toFixed(2)} cit/mo, ${mult.toFixed(1)}× venue baseline`;
    }
    if (c.name === "venue_prestige") {
      const venueName = p.venue?.name ?? "";
      c.raw = !venueName ? 3 : tier1.test(venueName) ? 9 : tier2.test(venueName) ? 7 : 4;
      c.rationale = `venue: ${venueName || "unknown"}`;
    }
    if (c.name === "author_signal") {
      const maxH = p.authors.reduce((m, a) => Math.max(m, a.h_index ?? 0), 0);
      c.raw = Math.min(10, Math.log2(maxH + 1) * 1.7);
      c.rationale = maxH > 0 ? `max h-index: ${maxH}` : "no h-index data";
    }
  }
  s.total = cats.reduce((t, c) => t + (c.raw * c.weight) / 10, 0);
}
scored.sort((a, b) => b.total - a.total);

writeFileSync(CORPUS_PATH, JSON.stringify(scored, null, 0));
console.log(`\n✅ updated ${CORPUS_PATH}`);
console.log(`   ${hydrated} papers hydrated, ${venuePromoted} venues promoted, ${hIndexPatched} h-index patches`);
console.log("\ntop 10 after backfill:");
for (const s of scored.slice(0, 10)) {
  const cit = s.paper.citation_count;
  console.log(
    `  ${s.total.toFixed(0).padStart(3)} | cit ${String(cit).padStart(4)} | ${(s.paper.eccg_category ?? "?").padEnd(20)} | ${s.paper.title.slice(0, 60)}`,
  );
}
