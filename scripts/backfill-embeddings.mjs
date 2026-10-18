#!/usr/bin/env node
/**
 * Replace the TF-IDF similarity matrix with semantically-aware cosine on
 * OpenAI `text-embedding-3-small` vectors.
 *
 *   • Embeddings cached at `.cache/embeddings.json` (gitignored — local
 *     speed-up only). Dimensions: 256 to keep cache size manageable.
 *   • Corpus loaded from src/fixtures/eccg_corpus.json.
 *   • New similarity edges (top-K cosine neighbours) overwrite
 *     src/fixtures/eccg_similarities.json.
 *
 * Cost estimate: 1,124 papers × ~250 tokens ≈ 280k tokens × $0.02/1M =
 * about $0.006 per full pass.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const CORPUS_PATH = "src/fixtures/eccg_corpus.json";
const SIM_PATH = "src/fixtures/eccg_similarities.json";
const CACHE_PATH = ".cache/embeddings.json";
const API = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";
const DIMENSIONS = 256;
const BATCH = 96;            // OpenAI accepts up to 2048 inputs per request
const TOP_K = 8;
const SIM_THRESHOLD = 0.30;

const args = process.argv.slice(2);
function val(name, fb) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fb;
}
const FORCE = args.includes("--force");
const LIMIT = Number(val("limit", 0));

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error("OPENAI_API_KEY required (script reads it from .env.local or env)");
  process.exit(1);
}

const log = (...x) => console.log(...x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── load corpus ───────────────────────────────────────────────────────
log(`loading ${CORPUS_PATH}`);
const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
const papers = corpus.map((s) => s.paper);
log(`  ${papers.length} papers`);

let cache = {};
if (existsSync(CACHE_PATH) && !FORCE) {
  try {
    cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    log(`  ${Object.keys(cache).length} cached embeddings`);
  } catch {
    log(`  cache parse failed — rebuilding`);
  }
}

function texts(p) {
  return `${p.title}. ${p.abstract}`.slice(0, 6000);
}

// ─── batch embed missing papers ────────────────────────────────────────
const todo = papers.filter((p) => !cache[p.id]).slice(0, LIMIT > 0 ? LIMIT : Infinity);
log(`  ${todo.length} papers to embed (batch ${BATCH})`);

for (let i = 0; i < todo.length; i += BATCH) {
  const slice = todo.slice(i, i + BATCH);
  const inputs = slice.map((p) => texts(p));
  let attempt = 0;
  for (;;) {
    const r = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: inputs, dimensions: DIMENSIONS }),
    });
    if (r.status === 200) {
      const j = await r.json();
      for (let k = 0; k < slice.length; k++) {
        cache[slice[k].id] = j.data[k].embedding;
      }
      break;
    }
    if (r.status === 429 && attempt < 4) {
      const delay = 2000 * Math.pow(2, attempt++);
      log(`    429 — back off ${delay}ms`);
      await sleep(delay);
      continue;
    }
    const body = await r.text();
    throw new Error(`embed ${r.status}: ${body.slice(0, 300)}`);
  }
  if ((i + BATCH) % (BATCH * 5) === 0 || i + BATCH >= todo.length) {
    log(`  ${Math.min(todo.length, i + BATCH)}/${todo.length}`);
  }
}

mkdirSync(dirname(CACHE_PATH), { recursive: true });
writeFileSync(CACHE_PATH, JSON.stringify(cache));
log(`  wrote ${CACHE_PATH} (${Object.keys(cache).length} embeddings)`);

// ─── compute similarities (cosine on pre-normalised vectors) ─────────
log(`\ncomputing top-${TOP_K} neighbours for ${papers.length} papers …`);

const ids = papers.map((p) => p.id);
// Pre-compute norms once
const vectors = ids.map((id) => cache[id] ?? null);
const norms = vectors.map((v) => {
  if (!v) return 0;
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
});

function cos(i, j) {
  const a = vectors[i];
  const b = vectors[j];
  if (!a || !b) return 0;
  let dot = 0;
  for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
  const denom = norms[i] * norms[j];
  return denom > 0 ? dot / denom : 0;
}

const sims = {};
let edgesKept = 0;
for (let i = 0; i < ids.length; i++) {
  const candidates = [];
  for (let j = 0; j < ids.length; j++) {
    if (j === i) continue;
    const c = cos(i, j);
    if (c > SIM_THRESHOLD) candidates.push({ id: ids[j], sim: Number(c.toFixed(4)) });
  }
  candidates.sort((a, b) => b.sim - a.sim);
  sims[ids[i]] = candidates.slice(0, TOP_K);
  edgesKept += sims[ids[i]].length;
  if ((i + 1) % 200 === 0) log(`  ${i + 1}/${ids.length}`);
}

writeFileSync(SIM_PATH, JSON.stringify(sims));
log(`\nwrote ${SIM_PATH}`);
log(`  ${ids.length} papers, ${edgesKept} edges`);
const withNeighbours = Object.values(sims).filter((e) => e.length > 0).length;
log(`  ${withNeighbours}/${ids.length} papers have ≥ 1 neighbour above threshold ${SIM_THRESHOLD}`);

// Quick qualitative spot-check on the survey paper
const SURVEY = "arxiv-1904.08405";
if (sims[SURVEY]?.length) {
  log(`\nnearest neighbours of "Event-based Vision: A Survey":`);
  const titleById = new Map(papers.map((p) => [p.id, p.title]));
  for (const n of sims[SURVEY]) {
    log(`  sim=${n.sim.toFixed(3)}  ${(titleById.get(n.id) ?? n.id).slice(0, 65)}`);
  }
}
