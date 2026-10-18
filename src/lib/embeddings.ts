/**
 * OpenAI embeddings client for cron-added papers.
 *
 * The bundled corpus is embedded once offline by
 * `scripts/backfill-embeddings.mjs` and its top-K cosine neighbours are
 * committed at `src/fixtures/eccg_similarities.json`. Cron-added papers
 * (those that land in `custom-corpus` Drive state after the daily refresh)
 * never see that pipeline, so we capture their vectors here and persist to
 * `eccg-state—custom-embeddings.json`. A weekly offline rebuild merges them
 * back into the static fixture.
 *
 * Cost: ~250 tokens per paper × $0.02/1M = ~$0.000005 per paper, capped at
 * BATCH_SIZE per request. A typical daily run embeds ≤ 50 papers, so this
 * runs comfortably inside the function budget.
 */

import { createHash } from "node:crypto";
import { fetchWithRetry } from "./fetch_retry";
import type { Paper } from "./models";
import { readState, writeState } from "./google/state";

const API = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";
const DIMENSIONS = 256;
const BATCH_SIZE = 64; // bound the per-request payload; OpenAI accepts up to 2048
export const CUSTOM_EMBEDDINGS_STATE = "custom-embeddings";

interface EmbeddingRecord {
  vector: number[];
  hash: string; // content hash so a corrected abstract triggers re-embed
  embedded_at: string;
}

type EmbeddingMap = Record<string, EmbeddingRecord>;

export function hasOpenAi(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function paperHash(p: Paper): string {
  return createHash("sha1")
    .update(`${p.title}\n${p.abstract.slice(0, 4000)}`)
    .digest("hex")
    .slice(0, 16);
}

function paperInput(p: Paper): string {
  return `${p.title}. ${p.abstract}`.slice(0, 6000);
}

async function callOpenAiEmbeddings(inputs: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY!.trim();
  const res = await fetchWithRetry(
    API,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: inputs, dimensions: DIMENSIONS }),
    },
    {
      maxAttempts: 4,
      baseMs: 1000,
      onRetry: (n, reason, wait) =>
        console.warn(`[openai-embeddings] retry ${n} after ${reason} — waiting ${wait}ms`),
    },
  );
  if (!res.ok) {
    throw new Error(
      `OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

export async function loadCustomEmbeddings(): Promise<EmbeddingMap> {
  return readState<EmbeddingMap>(CUSTOM_EMBEDDINGS_STATE, {});
}

export async function saveCustomEmbeddings(value: EmbeddingMap): Promise<void> {
  await writeState<EmbeddingMap>(CUSTOM_EMBEDDINGS_STATE, value);
}

interface EmbedResult {
  embedded: string[];   // paper ids newly embedded this run
  skipped: string[];    // ids already up-to-date
  failed: string[];     // ids that errored
  total: number;        // total in the embedding store after this run
}

/**
 * Bring `papers` up-to-date in the custom embeddings store. Embeds only
 * papers that are missing or whose content hash has changed. Returns the
 * lists of {embedded, skipped, failed} and the new total count.
 */
export async function embedPapersIncremental(
  papers: Paper[],
  limit = 200,
): Promise<EmbedResult> {
  if (!hasOpenAi()) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  const store = await loadCustomEmbeddings();
  const todo: Paper[] = [];
  const skipped: string[] = [];
  for (const p of papers) {
    const existing = store[p.id];
    const h = paperHash(p);
    if (existing && existing.hash === h) {
      skipped.push(p.id);
      continue;
    }
    todo.push(p);
    if (todo.length >= limit) break;
  }

  const embedded: string[] = [];
  const failed: string[] = [];
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const slice = todo.slice(i, i + BATCH_SIZE);
    try {
      const inputs = slice.map(paperInput);
      const vectors = await callOpenAiEmbeddings(inputs);
      const now = new Date().toISOString();
      for (let k = 0; k < slice.length; k++) {
        store[slice[k].id] = {
          vector: vectors[k],
          hash: paperHash(slice[k]),
          embedded_at: now,
        };
        embedded.push(slice[k].id);
      }
    } catch (err) {
      for (const p of slice) failed.push(p.id);
      console.warn(`embed batch failed (${slice.length} papers):`, err);
    }
  }

  if (embedded.length > 0) {
    await saveCustomEmbeddings(store);
  }

  return {
    embedded,
    skipped,
    failed,
    total: Object.keys(store).length,
  };
}
