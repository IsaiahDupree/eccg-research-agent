/**
 * Novelty proxy via TF-IDF distance from the corpus centroid.
 *
 * Real embedding-based novelty needs API calls and is V1.1. For V1 we use a
 * deterministic, dependency-free TF-IDF cosine.
 */

import type { NoveltySignal, Paper } from "../models";

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "is", "are", "we",
  "this", "that", "with", "on", "as", "by", "be", "from", "at", "using",
  "based", "novel", "propose", "proposed", "new", "approach", "method",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function termFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function l2(vec: Map<string, number>): number {
  let s = 0;
  for (const v of vec.values()) s += v * v;
  return Math.sqrt(s);
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  const small = a.size <= b.size ? a : b;
  const large = a.size <= b.size ? b : a;
  for (const [k, v] of small) dot += v * (large.get(k) ?? 0);
  const denom = l2(a) * l2(b);
  return denom > 0 ? dot / denom : 0;
}

function tfIdfVector(
  tokens: string[],
  idf: Map<string, number>,
): Map<string, number> {
  const tf = termFreq(tokens);
  const out = new Map<string, number>();
  const total = tokens.length || 1;
  for (const [t, c] of tf) {
    const idfVal = idf.get(t) ?? 0;
    out.set(t, (c / total) * idfVal);
  }
  return out;
}

export function computeNoveltySignals(papers: Paper[]): NoveltySignal[] {
  if (papers.length < 2) {
    return papers.map((p) => ({ paper_id: p.id, novelty: 0.5 }));
  }
  // Build IDF
  const tokens = papers.map((p) => tokenize(`${p.title}. ${p.abstract}`));
  const df = new Map<string, number>();
  for (const toks of tokens) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = papers.length;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log(N / d));

  const vectors = tokens.map((t) => tfIdfVector(t, idf));

  // Novelty proxy: 1 - max(cosine similarity to any other paper).
  // This is more interpretable than centroid distance — a paper is "novel"
  // when no neighbor is close to it. Avoids the small-corpus centroid bias
  // where a unique paper dominates its own centroid.
  return papers.map((p, i) => {
    let bestSim = 0;
    let bestIdx = -1;
    for (let j = 0; j < papers.length; j++) {
      if (j === i) continue;
      const s = cosine(vectors[i], vectors[j]);
      if (s > bestSim) {
        bestSim = s;
        bestIdx = j;
      }
    }
    return {
      paper_id: p.id,
      novelty: clamp01(1 - bestSim),
      nearest_paper_id: bestIdx >= 0 ? papers[bestIdx].id : undefined,
      nearest_similarity: bestIdx >= 0 ? bestSim : undefined,
    };
  });
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
