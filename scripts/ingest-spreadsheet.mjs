#!/usr/bin/env node
/**
 * Ingest Rick's ECCG spreadsheet → enriched Paper[] corpus + similarity edges.
 *
 *  1. Parse eccg-spreadsheet.xlsx (4,539 URLs in column A).
 *  2. Pull out the unique arXiv IDs.
 *  3. Batch-fetch arXiv metadata (100 IDs / request, 3 s between batches).
 *  4. (Optional) Hydrate citation counts via the Semantic Scholar batch
 *     endpoint (up to 500 IDs / call, free).
 *  5. Run our existing analysis layer: relevance, citation velocity, novelty.
 *  6. Score each paper with the v1 rubric.
 *  7. Compute TF-IDF cosine top-K neighbours for the similarity engine.
 *  8. Emit:
 *       src/fixtures/eccg_corpus.json
 *       src/fixtures/eccg_similarities.json
 *
 * Run with:
 *   npm run ingest:spreadsheet                  # arXiv only
 *   npm run ingest:spreadsheet -- --skip-s2     # no citation hydrate
 *   npm run ingest:spreadsheet -- --limit 200   # truncate (smoke test)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";

const args = process.argv.slice(2);
function flag(name) {
  return args.includes(`--${name}`);
}
function valueOf(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const SKIP_S2 = flag("skip-s2");
const LIMIT = Number(valueOf("limit", 0));
const XLSX_PATH = valueOf("xlsx", "eccg-spreadsheet.xlsx");
const CORPUS_OUT = valueOf("out", "src/fixtures/eccg_corpus.json");
const SIM_OUT = valueOf("sim-out", "src/fixtures/eccg_similarities.json");
const ARXIV_BATCH = 100;
const S2_BATCH = 500;
const TOP_K = 8;

// ─── helpers ───────────────────────────────────────────────────────────────
function log(...x) {
  console.log(...x);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 0));
}

// ─── 1. parse xlsx ─────────────────────────────────────────────────────────
log(`reading ${XLSX_PATH} …`);
const wb = XLSX.readFile(XLSX_PATH);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  defval: "",
});
const allUrls = rows
  .slice(1)
  .map((r) => r[0])
  .filter((u) => typeof u === "string" && u.startsWith("http"));
log(`  ${allUrls.length} URLs found in column A`);

// ─── 2. extract arXiv IDs ──────────────────────────────────────────────────
const ARXIV_RE =
  /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}|[a-z-]+\/[0-9]+)(?:v[0-9]+)?/i;
const arxivIds = new Set();
for (const u of allUrls) {
  const m = u.match(ARXIV_RE);
  if (m) arxivIds.add(m[1]);
}
let ids = Array.from(arxivIds);
if (LIMIT > 0) ids = ids.slice(0, LIMIT);
log(`  ${arxivIds.size} unique arXiv ids${LIMIT ? ` (limited to ${ids.length})` : ""}`);

// ─── 3. arXiv batch fetch ──────────────────────────────────────────────────
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const asArr = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

async function fetchArxivBatch(idList) {
  const params = new URLSearchParams({
    id_list: idList.join(","),
    max_results: String(idList.length),
  });
  const url = `https://export.arxiv.org/api/query?${params}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "eccg-research-agent/1.0" },
  });
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  const text = await res.text();
  const parsed = xml.parse(text);
  return asArr(parsed.feed?.entry);
}

function entryToPaper(e) {
  const idUrl = e.id ?? "";
  const m = idUrl.match(/abs\/([^v]+)(?:v\d+)?$/);
  const arxiv_id = m ? m[1] : idUrl;
  const authors = asArr(e.author).map((a) => ({ name: a.name }));
  const categories = asArr(e.category).map((c) => c["@_term"]);
  const linkArr = asArr(e.link);
  const pdf = linkArr.find((l) => l["@_type"] === "application/pdf");
  const html = linkArr.find((l) => l["@_rel"] === "alternate");
  const published = new Date(e.published);
  const months = Math.max(
    0,
    (Date.now() - published.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );
  return {
    id: `arxiv-${arxiv_id}`,
    arxiv_id,
    title: String(e.title || "").replace(/\s+/g, " ").trim(),
    abstract: String(e.summary || "").replace(/\s+/g, " ").trim(),
    authors,
    venue: { name: "arXiv preprint", type: "preprint" },
    published_at: published.toISOString(),
    categories,
    pdf_url: pdf?.["@_href"],
    html_url: html?.["@_href"],
    citation_count: 0,
    months_since_publish: months,
    citations_per_month: 0,
  };
}

const papers = [];
const failed = [];
log(`\nfetching arXiv metadata in batches of ${ARXIV_BATCH} …`);
for (let i = 0; i < ids.length; i += ARXIV_BATCH) {
  const slice = ids.slice(i, i + ARXIV_BATCH);
  try {
    const entries = await fetchArxivBatch(slice);
    for (const e of entries) {
      try {
        papers.push(entryToPaper(e));
      } catch (err) {
        failed.push({ phase: "parse", id: e.id, err: String(err) });
      }
    }
    log(`  batch ${Math.floor(i / ARXIV_BATCH) + 1}: +${entries.length} (total ${papers.length})`);
  } catch (err) {
    failed.push({ phase: "fetch", batch: i, err: String(err) });
    log(`  batch ${Math.floor(i / ARXIV_BATCH) + 1} FAILED: ${err}`);
  }
  await sleep(3100); // arXiv asks for ≥3s between requests
}

// ─── 4. Semantic Scholar batch hydrate ─────────────────────────────────────
if (!SKIP_S2 && papers.length > 0) {
  log(`\nhydrating ${papers.length} papers via Semantic Scholar batch …`);
  const fields = "paperId,externalIds,title,year,venue,publicationVenue,citationCount,influentialCitationCount,authors.name,authors.hIndex";
  const byArxivId = new Map(papers.map((p) => [p.arxiv_id, p]));
  let hydrated = 0;
  for (let i = 0; i < papers.length; i += S2_BATCH) {
    const slice = papers.slice(i, i + S2_BATCH);
    const idsBody = slice.map((p) => `ARXIV:${p.arxiv_id}`);
    try {
      const res = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/batch?fields=${fields}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "eccg-research-agent/1.0",
            ...(process.env.SEMANTIC_SCHOLAR_API_KEY
              ? { "x-api-key": process.env.SEMANTIC_SCHOLAR_API_KEY }
              : {}),
          },
          body: JSON.stringify({ ids: idsBody }),
        },
      );
      if (!res.ok) {
        log(`  S2 batch ${Math.floor(i / S2_BATCH) + 1}: ${res.status} ${await res.text()}`);
        await sleep(2000);
        continue;
      }
      const body = await res.json();
      for (let j = 0; j < body.length; j++) {
        const item = body[j];
        if (!item || !item.paperId) continue;
        const original = slice[j];
        const p = byArxivId.get(original.arxiv_id);
        if (!p) continue;
        p.s2_id = item.paperId;
        p.doi = item.externalIds?.DOI;
        p.citation_count = item.citationCount ?? 0;
        p.influential_citation_count = item.influentialCitationCount;
        if (p.months_since_publish > 0) {
          p.citations_per_month = p.citation_count / p.months_since_publish;
        }
        if (item.publicationVenue?.name && p.venue?.type === "preprint") {
          const name = item.publicationVenue.name;
          p.venue = {
            name,
            type: /CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|ICRA|IROS|BMVC|WACV|AAAI|IJCAI/.test(name)
              ? "conference"
              : /TPAMI|RAL|TRO|IJCV|TIP|TVCG/.test(name)
                ? "journal"
                : "unknown",
          };
        }
        if (item.authors?.length && p.authors.length) {
          const byName = new Map(item.authors.map((a) => [a.name, a.hIndex]));
          p.authors = p.authors.map((a) => ({ ...a, h_index: byName.get(a.name) }));
        }
        hydrated++;
      }
      log(`  S2 batch ${Math.floor(i / S2_BATCH) + 1}: +${body.length} (cumulative ${hydrated} hydrated)`);
    } catch (err) {
      log(`  S2 batch ${Math.floor(i / S2_BATCH) + 1} FAILED: ${err}`);
    }
    await sleep(2000);
  }
}

// ─── 5. analysis: relevance, velocity, novelty ─────────────────────────────
log(`\nrunning analysis layer …`);

// ECCG taxonomy (mirrors src/lib/taxonomy.ts)
const TAXONOMY = [
  { slug: "survey", keywords: ["survey", "review", "overview", "tutorial"] },
  { slug: "feature_tracking", keywords: ["feature detection", "feature tracking", "keypoint", "corner detection", "tracking"] },
  { slug: "optical_flow", keywords: ["optical flow", "flow estimation", "motion estimation"] },
  { slug: "reconstruction", keywords: ["image reconstruction", "video reconstruction", "intensity reconstruction", "e2vid", "frame reconstruction"] },
  { slug: "depth", keywords: ["depth estimation", "stereo", "disparity", "monocular depth"] },
  { slug: "slam", keywords: ["slam", "vio", "visual-inertial", "odometry", "localization", "mapping"] },
  { slug: "segmentation", keywords: ["segmentation", "instance segmentation", "semantic segmentation"] },
  { slug: "recognition", keywords: ["classification", "recognition", "action recognition", "gesture"] },
  { slug: "object_detection", keywords: ["object detection", "detector", "bounding box", "yolo"] },
  { slug: "signal_processing", keywords: ["denoising", "noise filtering", "signal processing", "hot pixel"] },
  { slug: "control_robotics", keywords: ["obstacle avoidance", "drone", "uav", "quadrotor", "robot", "control", "manipulation"] },
  { slug: "neuromorphic_hardware", keywords: ["loihi", "truenorth", "spinnaker", "neuromorphic processor", "memristor", "spiking hardware"] },
  { slug: "snn", keywords: ["spiking neural network", "snn", "spiking", "leaky integrate"] },
  { slug: "simulator", keywords: ["simulator", "synthetic event", "v2e", "esim", "event simulation"] },
  { slug: "dataset", keywords: ["dataset", "benchmark", "n-cars", "n-mnist", "mvsec", "ddd17", "dsec"] },
  { slug: "device_sensor", keywords: ["davis", "dvs", "prophesee", "inivation", "samsung dvs", "event camera sensor"] },
  { slug: "tactile_other", keywords: ["tactile", "neurotac", "event tactile"] },
];
const CORE = ["event camera", "event-based vision", "event-based", "neuromorphic vision", "dynamic vision sensor", "dvs", "davis", "spike camera", "asynchronous vision", "silicon retina"];
const ARTICLES = new Set(["a", "an", "the"]);

function countPhrase(text, phrase) {
  let count = 0;
  let from = 0;
  while (true) {
    const idx = text.indexOf(phrase, from);
    if (idx < 0) break;
    count++;
    from = idx + phrase.length;
  }
  return count;
}

function assignRelevance(p) {
  const title = p.title.toLowerCase();
  const abstract = p.abstract.toLowerCase();
  const text = `${title} ${abstract}`;
  let coreHits = 0;
  for (const k of CORE) if (text.includes(k)) coreHits++;
  let best = { slug: "", score: 0 };
  for (const cat of TAXONOMY) {
    let score = 0;
    let consumed = text;
    const sortedKeys = [...cat.keywords].sort((a, b) => b.length - a.length);
    for (const k of sortedKeys) {
      score += countPhrase(title, k) * 2;
      score += countPhrase(consumed.replace(title, ""), k);
      consumed = consumed.split(k).join("");
    }
    if (score > best.score) best = { slug: cat.slug, score };
  }
  p.eccg_relevance = Math.min(1, coreHits * 0.4 + best.score * 0.1);
  p.eccg_category = best.score > 0 ? best.slug : undefined;
}

for (const p of papers) assignRelevance(p);

// citation velocity (already populated by S2; derive multipliers)
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const corpusBaseline = median(papers.map((p) => p.citations_per_month).filter((x) => x > 0)) || 0.05;
const byVenue = new Map();
for (const p of papers) {
  const v = p.venue?.name ?? "unknown";
  if (!byVenue.has(v)) byVenue.set(v, []);
  byVenue.get(v).push(p.citations_per_month);
}
const venueBaseline = new Map();
for (const [v, arr] of byVenue) venueBaseline.set(v, median(arr));

function scorePaper(p) {
  // rubric weights summed to 100 (mirrors src/lib/scoring/weights.ts)
  const venue = p.venue?.name ?? "unknown";
  const base =
    (byVenue.get(venue)?.length ?? 0) >= 3
      ? venueBaseline.get(venue) || corpusBaseline
      : corpusBaseline;
  const mult = p.citations_per_month / Math.max(0.01, base);
  const cats = [];
  // citation velocity
  cats.push({
    name: "citation_velocity",
    weight: 20,
    raw: mult <= 0 ? 0 : Math.min(10, 5 + 2 * Math.log2(mult + 1)),
    rationale: `${p.citations_per_month.toFixed(2)} cit/mo, ${mult.toFixed(1)}× venue baseline`,
  });
  // eccg relevance
  cats.push({
    name: "eccg_relevance",
    weight: 25,
    raw: (p.eccg_relevance ?? 0) * 10,
    rationale: p.eccg_category
      ? `taxonomy: ${p.eccg_category} (${(p.eccg_relevance ?? 0).toFixed(2)})`
      : `core-keyword match ${(p.eccg_relevance ?? 0).toFixed(2)}`,
  });
  // code availability — skipped during ingest, GitHub search later
  cats.push({ name: "code_availability", weight: 15, raw: 0, rationale: "to-be-resolved" });
  // novelty — placeholder; filled after similarity pass
  cats.push({ name: "novelty", weight: 15, raw: 5, rationale: "placeholder until similarity ready" });
  // venue prestige
  const venueName = p.venue?.name ?? "";
  const tier1 = /\b(CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|TPAMI|IJCV|TRO|RAL|ICRA|IROS)\b/i;
  const tier2 = /\b(BMVC|WACV|3DV|AAAI|IJCAI|TIP|TCSVT|ACCV|TVCG)\b/i;
  cats.push({
    name: "venue_prestige",
    weight: 10,
    raw: !venueName ? 3 : tier1.test(venueName) ? 9 : tier2.test(venueName) ? 7 : 4,
    rationale: `venue: ${venueName || "unknown"}`,
  });
  // author signal
  const maxH = p.authors.reduce((m, a) => Math.max(m, a.h_index ?? 0), 0);
  cats.push({
    name: "author_signal",
    weight: 10,
    raw: Math.min(10, Math.log2(maxH + 1) * 1.7),
    rationale: maxH > 0 ? `max h-index: ${maxH}` : "no h-index data",
  });
  // recency
  cats.push({
    name: "recency",
    weight: 5,
    raw: 10 * Math.exp(-p.months_since_publish / 12),
    rationale: `${p.months_since_publish.toFixed(1)} months old`,
  });
  const total = cats.reduce((s, c) => s + (c.raw * c.weight) / 10, 0);
  return { categories: cats, total };
}

const scored = papers.map((p) => ({ paper: p, ...scorePaper(p) }));

// ─── 6. similarity (TF-IDF cosine) ─────────────────────────────────────────
log(`\ncomputing TF-IDF similarity (top ${TOP_K} per paper) …`);

const STOP = new Set("the a an and or of to in for is are we this that with on as by be from at using based novel propose proposed new approach method paper work present results show our we propose using based".split(" "));

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

const tokens = papers.map((p) => tokenize(`${p.title}. ${p.abstract}`));
const df = new Map();
for (const toks of tokens) {
  for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
}
const N = papers.length;
const idf = new Map();
for (const [t, d] of df) idf.set(t, Math.log(N / d));

function tfidf(toks) {
  const tf = new Map();
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  const out = new Map();
  const total = toks.length || 1;
  for (const [t, c] of tf) {
    const i = idf.get(t) ?? 0;
    if (i > 0) out.set(t, (c / total) * i);
  }
  return out;
}

const vectors = tokens.map((t) => tfidf(t));
const norms = vectors.map((v) => {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
});

function cosine(i, j) {
  const a = vectors[i];
  const b = vectors[j];
  const small = a.size <= b.size ? a : b;
  const large = a.size <= b.size ? b : a;
  let dot = 0;
  for (const [k, v] of small) dot += v * (large.get(k) ?? 0);
  const denom = norms[i] * norms[j];
  return denom > 0 ? dot / denom : 0;
}

const similarities = {};
const noveltyMap = new Map();
for (let i = 0; i < papers.length; i++) {
  const sims = [];
  for (let j = 0; j < papers.length; j++) {
    if (j === i) continue;
    const c = cosine(i, j);
    if (c > 0.08) sims.push({ id: papers[j].id, sim: Number(c.toFixed(4)) });
  }
  sims.sort((a, b) => b.sim - a.sim);
  similarities[papers[i].id] = sims.slice(0, TOP_K);
  const top = sims[0]?.sim ?? 0;
  noveltyMap.set(papers[i].id, Math.max(0, Math.min(1, 1 - top)));
  if (i % 200 === 0 && i > 0) log(`  similarity ${i}/${papers.length}`);
}

// patch novelty into the scored rubric now that we have it
for (const s of scored) {
  const nov = noveltyMap.get(s.paper.id) ?? 0.5;
  const cat = s.categories.find((c) => c.name === "novelty");
  if (cat) {
    cat.raw = nov * 10;
    cat.rationale = `nearest-neighbour distance ${(1 - nov).toFixed(2)} (top sim)`;
    s.total = s.categories.reduce((t, c) => t + (c.raw * c.weight) / 10, 0);
  }
}
scored.sort((a, b) => b.total - a.total);

// ─── 7. write outputs ─────────────────────────────────────────────────────
log(`\nwriting outputs …`);
writeJson(CORPUS_OUT, scored);
writeJson(SIM_OUT, similarities);

log(`\n✅ done`);
log(`   corpus:       ${papers.length} papers → ${CORPUS_OUT}`);
log(`   similarities: ${SIM_OUT}`);
if (failed.length) log(`   failures:     ${failed.length} (see log above)`);
log("");
log("top 10 by composite score:");
for (const s of scored.slice(0, 10)) {
  log(
    `  ${s.total.toFixed(0).padStart(3)} | ${(s.paper.eccg_category ?? "?").padEnd(20)} | ${s.paper.title.slice(0, 70)}`,
  );
}
