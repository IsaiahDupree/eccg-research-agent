#!/usr/bin/env node
/**
 * Ingest OpenReview URLs from the ECCG spreadsheet.
 *
 *   1. Parse eccg-spreadsheet.xlsx column A.
 *   2. Extract openreview.net `?id=…` and `/forum?id=…` ids.
 *   3. Fetch each note via api2.openreview.net.
 *   4. Map to our Paper schema, score with the rubric, persist.
 *
 * Run with:
 *   node scripts/ingest-openreview.mjs            # full pass
 *   node scripts/ingest-openreview.mjs --limit 5  # smoke test
 */

import { readFileSync, writeFileSync } from "node:fs";
import XLSX from "xlsx";

const XLSX_PATH = "eccg-spreadsheet.xlsx";
const CORPUS_PATH = "src/fixtures/eccg_corpus.json";
const SIM_PATH = "src/fixtures/eccg_similarities.json";
const API_BASES = ["https://api2.openreview.net", "https://api.openreview.net"];
const CONCURRENCY = 4;
const TOP_K = 8;

const args = process.argv.slice(2);
const LIMIT = Number((() => {
  const i = args.indexOf("--limit");
  return i >= 0 && i + 1 < args.length ? args[i + 1] : 0;
})());

const log = (...x) => console.log(...x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 1. parse xlsx ────────────────────────────────────────────────────────
log(`reading ${XLSX_PATH} …`);
const wb = XLSX.readFile(XLSX_PATH);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
const urls = rows.slice(1).map((r) => r[0]).filter((u) => typeof u === "string" && u.startsWith("http"));
log(`  ${urls.length} URLs`);

// ─── 2. extract openreview ids ────────────────────────────────────────────
const idRe = /openreview\.net\/(?:forum|pdf|attachment)\?(?:[^\s#]*[&?])?id=([^&\s)>"']+)/i;
const ids = new Set();
for (const u of urls) {
  const m = u.match(idRe);
  if (m) ids.add(m[1]);
}
let todo = Array.from(ids);
if (LIMIT > 0) todo = todo.slice(0, LIMIT);
log(`  ${ids.size} unique OpenReview ids${LIMIT ? ` (limited to ${todo.length})` : ""}`);

// ─── 3. dedupe against existing corpus ───────────────────────────────────
const scoredCorpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
const knownIds = new Set(scoredCorpus.map((s) => s.paper.id));
const newIds = todo.filter((id) => !knownIds.has(`openreview-${id}`));
log(`  ${newIds.length} new (after dedup)`);

// ─── 4. fetch notes ──────────────────────────────────────────────────────
async function fetchNote(id) {
  for (const base of API_BASES) {
    try {
      const r = await fetch(`${base}/notes?forum=${encodeURIComponent(id)}&details=replyCount`, {
        headers: { Accept: "application/json", "User-Agent": "eccg-research-agent/1.0" },
      });
      if (!r.ok) continue;
      const j = await r.json();
      const note =
        (j.notes ?? []).find((n) => n.id === id) ??
        (j.notes ?? []).find((n) => !n.replyto || n.replyto === n.forum) ??
        (j.notes ?? [])[0];
      if (note) return note;
    } catch {
      // try next base
    }
  }
  return null;
}

function readValue(content, key) {
  const v = content?.[key];
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof v.value === "string") return v.value;
  return undefined;
}

function readArray(content, key) {
  const v = content?.[key];
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "object" && Array.isArray(v.value)) return v.value.map(String);
  return [];
}

function noteToPaper(id, note) {
  const c = note.content ?? {};
  const title = readValue(c, "title");
  if (!title) return null;
  const abstract = readValue(c, "abstract") ?? "";
  const authors = readArray(c, "authors").map((name) => ({ name }));
  const venueName = readValue(c, "venue") ?? readValue(c, "venueid") ?? "OpenReview";
  const ts = note.cdate ?? note.tcdate ?? note.mdate;
  const publishedAt = ts ? new Date(ts) : new Date();
  const months = Math.max(
    0,
    (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );
  return {
    id: `openreview-${id}`,
    openreview_id: id,
    title: title.replace(/\s+/g, " ").trim(),
    abstract: abstract.replace(/\s+/g, " ").trim(),
    authors,
    venue: { name: venueName, type: venueType(venueName) },
    published_at: publishedAt.toISOString(),
    categories: [],
    html_url: `https://openreview.net/forum?id=${id}`,
    pdf_url: `https://openreview.net/pdf?id=${id}`,
    citation_count: 0,
    months_since_publish: months,
    citations_per_month: 0,
  };
}

function venueType(name) {
  if (!name) return "unknown";
  if (/ICLR|NeurIPS|NIPS|ICML|TMLR/i.test(name)) return "conference";
  return "unknown";
}

const collected = [];
let i = 0;
log(`\nfetching from OpenReview (concurrency ${CONCURRENCY}) …`);
async function worker() {
  while (i < newIds.length) {
    const idx = i++;
    const id = newIds[idx];
    const note = await fetchNote(id);
    if (note) {
      const paper = noteToPaper(id, note);
      if (paper) collected.push(paper);
    }
    if ((idx + 1) % 10 === 0) {
      log(`  ${idx + 1}/${newIds.length} done (${collected.length} ok)`);
    }
    await sleep(150); // polite throttling
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
log(`  ${collected.length} papers fetched`);

// ─── 5. relevance + filter ───────────────────────────────────────────────
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

function count(text, k) {
  let c = 0;
  let from = 0;
  while (true) {
    const idx = text.indexOf(k, from);
    if (idx < 0) break;
    c++;
    from = idx + k.length;
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
      s += count(title, k) * 2;
      s += count(consumed.replace(title, ""), k);
      consumed = consumed.split(k).join("");
    }
    if (s > best.score) best = { slug: cat.slug, score: s };
  }
  p.eccg_relevance = Math.min(1, core * 0.4 + best.score * 0.1);
  p.eccg_category = best.score > 0 ? best.slug : undefined;
}

for (const p of collected) assignRelevance(p);
const keeps = collected.filter((p) => (p.eccg_relevance ?? 0) >= 0.1);
log(`  filter by ECCG relevance ≥ 0.1: ${keeps.length} keeps / ${collected.length} fetched`);

// ─── 6. score ─────────────────────────────────────────────────────────────
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
  byVenue.get(v).push(p.citations_per_month ?? 0);
}
const corpusBaseline = median(allPapers.map((p) => p.citations_per_month ?? 0).filter((x) => x > 0)) || 0.05;
const venueBaseline = new Map();
for (const [v, arr] of byVenue) venueBaseline.set(v, median(arr));
const tier1 = /\b(CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|TPAMI|IJCV|TRO|RAL|ICRA|IROS)\b/i;
const tier2 = /\b(BMVC|WACV|3DV|AAAI|IJCAI|TIP|TCSVT|ACCV|TVCG)\b/i;

function scoreOne(p) {
  const venue = p.venue?.name ?? "unknown";
  const base = (byVenue.get(venue)?.length ?? 0) >= 3 ? venueBaseline.get(venue) || corpusBaseline : corpusBaseline;
  const mult = (p.citations_per_month ?? 0) / Math.max(0.01, base);
  const cats = [
    { name: "citation_velocity", weight: 20, raw: mult <= 0 ? 0 : Math.min(10, 5 + 2 * Math.log2(mult + 1)), rationale: `${(p.citations_per_month ?? 0).toFixed(2)} cit/mo` },
    { name: "eccg_relevance", weight: 25, raw: (p.eccg_relevance ?? 0) * 10, rationale: p.eccg_category ? `taxonomy: ${p.eccg_category}` : "core-keyword match" },
    { name: "code_availability", weight: 15, raw: 0, rationale: "to-be-resolved" },
    { name: "novelty", weight: 15, raw: 5, rationale: "placeholder until similarity ready" },
    { name: "venue_prestige", weight: 10,
      raw: !p.venue?.name ? 3 : tier1.test(p.venue.name) ? 9 : tier2.test(p.venue.name) ? 7 : 4,
      rationale: `venue: ${p.venue?.name || "unknown"}` },
    { name: "author_signal", weight: 10, raw: 0, rationale: "no h-index data" },
    { name: "recency", weight: 5, raw: 10 * Math.exp(-(p.months_since_publish ?? 0) / 12), rationale: `${(p.months_since_publish ?? 0).toFixed(1)} mo old` },
  ];
  const total = cats.reduce((t, c) => t + (c.raw * c.weight) / 10, 0);
  return { paper: p, categories: cats, total };
}

const newScored = keeps.map(scoreOne);
const merged = [...scoredCorpus, ...newScored];

// ─── 7. recompute similarity ─────────────────────────────────────────────
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
function cos(i, j) {
  const a = vectors[i], b = vectors[j];
  const small = a.size <= b.size ? a : b;
  const large = a.size <= b.size ? b : a;
  let dot = 0;
  for (const [k, v] of small) dot += v * (large.get(k) ?? 0);
  const denom = norms[i] * norms[j];
  return denom > 0 ? dot / denom : 0;
}
const sims = {};
const novMap = new Map();
for (let i2 = 0; i2 < papers.length; i2++) {
  const candidates = [];
  for (let j = 0; j < papers.length; j++) {
    if (j === i2) continue;
    const c = cos(i2, j);
    if (c > 0.08) candidates.push({ id: papers[j].id, sim: Number(c.toFixed(4)) });
  }
  candidates.sort((a, b) => b.sim - a.sim);
  sims[papers[i2].id] = candidates.slice(0, TOP_K);
  novMap.set(papers[i2].id, Math.max(0, Math.min(1, 1 - (candidates[0]?.sim ?? 0))));
}
for (const s of merged) {
  const nov = novMap.get(s.paper.id) ?? 0.5;
  const c = s.categories.find((x) => x.name === "novelty");
  if (c) {
    c.raw = nov * 10;
    c.rationale = `nearest-neighbour ${(1 - nov).toFixed(2)}`;
    s.total = s.categories.reduce((t, x) => t + (x.raw * x.weight) / 10, 0);
  }
}
merged.sort((a, b) => b.total - a.total);

// ─── 8. save ─────────────────────────────────────────────────────────────
writeFileSync(CORPUS_PATH, JSON.stringify(merged, null, 0));
writeFileSync(SIM_PATH, JSON.stringify(sims, null, 0));
log(`\n✅ wrote ${CORPUS_PATH} (${merged.length} papers, +${newScored.length} new)`);
log(`✅ wrote ${SIM_PATH}`);
if (newScored.length > 0) {
  log("\nnew additions:");
  for (const s of newScored.slice(0, 10)) {
    log(`  ${s.total.toFixed(0).padStart(3)} | ${(s.paper.eccg_category ?? "?").padEnd(20)} | ${s.paper.title.slice(0, 55)}`);
  }
}
