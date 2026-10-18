#!/usr/bin/env node
/**
 * Ingest non-arXiv DOI-bearing URLs from the spreadsheet via Crossref.
 *
 *   1. Parse eccg-spreadsheet.xlsx column A.
 *   2. Extract DOIs from any URL that contains a `10.x/y` pattern.
 *   3. Dedupe against the existing corpus (skip DOIs we already have).
 *   4. Fetch each DOI from Crossref (concurrency 8, polite user-agent).
 *   5. Normalise to our Paper schema.
 *   6. Score with the same rubric.
 *   7. Recompute TF-IDF similarity on the merged corpus.
 *   8. Save updated eccg_corpus.json + eccg_similarities.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import XLSX from "xlsx";

const XLSX_PATH = "eccg-spreadsheet.xlsx";
const CORPUS_PATH = "src/fixtures/eccg_corpus.json";
const SIM_PATH = "src/fixtures/eccg_similarities.json";
const CONCURRENCY = 8;
const TOP_K = 8;
const POLITE_UA = "eccg-research-agent/1.0 (mailto:isaiahdupree33@gmail.com)";

const args = process.argv.slice(2);
function flag(name) { return args.includes(`--${name}`); }
function valueOf(name, fb) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fb;
}
const LIMIT = Number(valueOf("limit", 0));

const log = (...x) => console.log(...x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 1. parse xlsx ───────────────────────────────────────────────────────
log(`reading ${XLSX_PATH} …`);
const wb = XLSX.readFile(XLSX_PATH);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
const urls = rows.slice(1).map((r) => r[0]).filter((u) => typeof u === "string" && u.startsWith("http"));
log(`  ${urls.length} URLs`);

// ─── 2. extract DOIs ─────────────────────────────────────────────────────
const DOI_RE = /\b(10\.\d{4,9}\/[^\s)>"']+)/i;
function cleanDoi(d) {
  return d
    .replace(/[)>,.;\]]*$/, "")        // trailing punctuation
    .replace(/\?.*$/, "")              // query string
    .replace(/#.*$/, "")               // fragment
    .toLowerCase();
}
const dois = new Set();
for (const u of urls) {
  const m = u.match(DOI_RE);
  if (m) dois.add(cleanDoi(m[1]));
}
log(`  ${dois.size} unique DOIs`);

// ─── 3. dedupe vs. existing corpus ───────────────────────────────────────
log(`\nloading ${CORPUS_PATH} …`);
const scoredCorpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
const existingDois = new Set(
  scoredCorpus.map((s) => s.paper.doi).filter((d) => typeof d === "string").map(cleanDoi),
);
log(`  ${existingDois.size} DOIs already in corpus`);

let todo = Array.from(dois).filter((d) => !existingDois.has(d));
if (LIMIT > 0) todo = todo.slice(0, LIMIT);
log(`  ${todo.length} new DOIs to fetch`);

// ─── 4. crossref fetch with concurrency ──────────────────────────────────
function stripJats(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyVenueType(name) {
  if (!name) return "unknown";
  if (/CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|ICRA|IROS|BMVC|WACV|AAAI|IJCAI/i.test(name))
    return "conference";
  if (/TPAMI|RAL|TRO|IJCV|TIP|TVCG|Sensors|Frontiers|Nature|Science|IEEE Transactions/i.test(name))
    return "journal";
  return "unknown";
}

function workToPaper(doi, w) {
  if (!w) return null;
  const title = Array.isArray(w.title) ? w.title[0] : w.title;
  if (!title) return null;
  const authors = Array.isArray(w.author)
    ? w.author.map((a) => ({
        name: [a.given, a.family].filter(Boolean).join(" ") || a.name || a.family || "Unknown",
      }))
    : [];
  const venueName =
    (Array.isArray(w["container-title"]) ? w["container-title"][0] : w["container-title"]) ||
    (Array.isArray(w["short-container-title"])
      ? w["short-container-title"][0]
      : w["short-container-title"]) ||
    "";
  const dateParts =
    w.issued?.["date-parts"]?.[0] ??
    w.created?.["date-parts"]?.[0] ??
    w.published?.["date-parts"]?.[0];
  let publishedAt = new Date();
  if (dateParts) {
    const [y, mo = 1, d = 1] = dateParts;
    publishedAt = new Date(Date.UTC(y, mo - 1, d));
  }
  const months = Math.max(0, (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  return {
    id: `doi-${doi}`,
    arxiv_id: undefined,
    doi,
    title: String(title).replace(/\s+/g, " ").trim(),
    abstract: stripJats(w.abstract).slice(0, 4000),
    authors,
    venue: venueName ? { name: venueName, type: classifyVenueType(venueName) } : undefined,
    published_at: publishedAt.toISOString(),
    categories: [],
    html_url: w.URL || `https://doi.org/${doi}`,
    pdf_url: w.link?.find((l) => l["content-type"] === "application/pdf")?.URL,
    citation_count: w["is-referenced-by-count"] ?? 0,
    months_since_publish: months,
    citations_per_month: 0,
  };
}

async function fetchOne(doi) {
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": POLITE_UA, Accept: "application/json" },
    });
    if (!r.ok) return { doi, paper: null, status: r.status };
    const j = await r.json();
    return { doi, paper: workToPaper(doi, j.message), status: 200 };
  } catch (e) {
    return { doi, paper: null, error: String(e) };
  }
}

log(`\nfetching ${todo.length} from Crossref (concurrency ${CONCURRENCY}) …`);
const newPapers = [];
const errors = [];
let i = 0;
let done = 0;
async function worker() {
  while (i < todo.length) {
    const idx = i++;
    const doi = todo[idx];
    const res = await fetchOne(doi);
    done++;
    if (res.paper) newPapers.push(res.paper);
    else errors.push({ doi: res.doi, status: res.status, error: res.error });
    if (done % 100 === 0) log(`  ${done}/${todo.length} done (${newPapers.length} ok, ${errors.length} skipped)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
log(`  ${newPapers.length} new papers fetched, ${errors.length} skipped`);

// ─── 5. derive cpm + relevance + base score ──────────────────────────────
for (const p of newPapers) {
  if (p.months_since_publish > 0 && p.citation_count > 0) {
    p.citations_per_month = p.citation_count / p.months_since_publish;
  }
}

// ECCG taxonomy (same as ingest-spreadsheet.mjs)
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

function countPhrase(text, phrase) {
  let c = 0;
  let from = 0;
  while (true) {
    const idx = text.indexOf(phrase, from);
    if (idx < 0) break;
    c++;
    from = idx + phrase.length;
  }
  return c;
}
function assignRelevance(p) {
  const title = p.title.toLowerCase();
  const abstract = p.abstract.toLowerCase();
  const text = `${title} ${abstract}`;
  let core = 0;
  for (const k of CORE) if (text.includes(k)) core++;
  let best = { slug: "", score: 0 };
  for (const cat of TAXONOMY) {
    let s = 0;
    let consumed = text;
    const ks = [...cat.keywords].sort((a, b) => b.length - a.length);
    for (const k of ks) {
      s += countPhrase(title, k) * 2;
      s += countPhrase(consumed.replace(title, ""), k);
      consumed = consumed.split(k).join("");
    }
    if (s > best.score) best = { slug: cat.slug, score: s };
  }
  p.eccg_relevance = Math.min(1, core * 0.4 + best.score * 0.1);
  p.eccg_category = best.score > 0 ? best.slug : undefined;
}
for (const p of newPapers) assignRelevance(p);

// Filter: only keep new papers with non-zero ECCG relevance — others are
// likely Crossref noise from cross-cited DOIs that aren't event-camera.
const beforeFilter = newPapers.length;
const keeps = newPapers.filter((p) => (p.eccg_relevance ?? 0) >= 0.1);
log(`  filter by ECCG relevance ≥ 0.1: ${keeps.length} keeps / ${beforeFilter} fetched`);

// ─── 6. score with full rubric ───────────────────────────────────────────
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const allPapers = [...scoredCorpus.map((s) => s.paper), ...keeps];
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

function scoreOne(p) {
  const venue = p.venue?.name ?? "unknown";
  const base = (byVenue.get(venue)?.length ?? 0) >= 3 ? venueBaseline.get(venue) || corpusBaseline : corpusBaseline;
  const mult = p.citations_per_month / Math.max(0.01, base);
  const cats = [
    { name: "citation_velocity", weight: 20, raw: mult <= 0 ? 0 : Math.min(10, 5 + 2 * Math.log2(mult + 1)),
      rationale: `${p.citations_per_month.toFixed(2)} cit/mo, ${mult.toFixed(1)}× venue baseline` },
    { name: "eccg_relevance", weight: 25, raw: (p.eccg_relevance ?? 0) * 10,
      rationale: p.eccg_category ? `taxonomy: ${p.eccg_category}` : "core-keyword match" },
    { name: "code_availability", weight: 15, raw: 0, rationale: "to-be-resolved" },
    { name: "novelty", weight: 15, raw: 5, rationale: "placeholder until similarity ready" },
    { name: "venue_prestige", weight: 10,
      raw: !p.venue?.name ? 3 : tier1.test(p.venue.name) ? 9 : tier2.test(p.venue.name) ? 7 : 4,
      rationale: `venue: ${p.venue?.name || "unknown"}` },
    { name: "author_signal", weight: 10,
      raw: Math.min(10, Math.log2(((p.authors ?? []).reduce((m, a) => Math.max(m, a.h_index ?? 0), 0)) + 1) * 1.7),
      rationale: "no h-index data" },
    { name: "recency", weight: 5, raw: 10 * Math.exp(-p.months_since_publish / 12),
      rationale: `${p.months_since_publish.toFixed(1)} months old` },
  ];
  const total = cats.reduce((t, c) => t + (c.raw * c.weight) / 10, 0);
  return { paper: p, categories: cats, total };
}

const newScored = keeps.map(scoreOne);
const merged = [...scoredCorpus, ...newScored];

// ─── 7. recompute similarity on merged corpus ────────────────────────────
log(`\nrecomputing TF-IDF similarity on ${merged.length} papers …`);
const STOP = new Set("the a an and or of to in for is are we this that with on as by be from at using based novel propose proposed new approach method paper work present results show our we propose using based".split(" "));
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}
const papers = merged.map((s) => s.paper);
const tokens = papers.map((p) => tokenize(`${p.title}. ${p.abstract}`));
const df = new Map();
for (const t of tokens) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
const N = papers.length;
const idf = new Map();
for (const [w, d] of df) idf.set(w, Math.log(N / d));
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
  const a = vectors[i], b = vectors[j];
  const small = a.size <= b.size ? a : b;
  const large = a.size <= b.size ? b : a;
  let dot = 0;
  for (const [k, v] of small) dot += v * (large.get(k) ?? 0);
  const denom = norms[i] * norms[j];
  return denom > 0 ? dot / denom : 0;
}
const sims = {};
const noveltyMap = new Map();
for (let i = 0; i < papers.length; i++) {
  const candidates = [];
  for (let j = 0; j < papers.length; j++) {
    if (j === i) continue;
    const c = cosine(i, j);
    if (c > 0.08) candidates.push({ id: papers[j].id, sim: Number(c.toFixed(4)) });
  }
  candidates.sort((a, b) => b.sim - a.sim);
  sims[papers[i].id] = candidates.slice(0, TOP_K);
  noveltyMap.set(papers[i].id, Math.max(0, Math.min(1, 1 - (candidates[0]?.sim ?? 0))));
  if (i % 500 === 0 && i > 0) log(`  ${i}/${papers.length}`);
}
for (const s of merged) {
  const nov = noveltyMap.get(s.paper.id) ?? 0.5;
  const cat = s.categories.find((c) => c.name === "novelty");
  if (cat) {
    cat.raw = nov * 10;
    cat.rationale = `nearest-neighbour distance ${(1 - nov).toFixed(2)}`;
    s.total = s.categories.reduce((t, c) => t + (c.raw * c.weight) / 10, 0);
  }
}
merged.sort((a, b) => b.total - a.total);

// ─── 8. save ─────────────────────────────────────────────────────────────
writeFileSync(CORPUS_PATH, JSON.stringify(merged, null, 0));
writeFileSync(SIM_PATH, JSON.stringify(sims, null, 0));
log(`\n✅ wrote ${CORPUS_PATH} (${merged.length} papers)`);
log(`✅ wrote ${SIM_PATH}`);
log(`\ntop 15 of merged corpus:`);
for (const s of merged.slice(0, 15)) {
  log(`  ${s.total.toFixed(0).padStart(3)} | cit ${String(s.paper.citation_count).padStart(4)} | ${(s.paper.eccg_category ?? "?").padEnd(20)} | ${s.paper.title.slice(0, 55)}`);
}
