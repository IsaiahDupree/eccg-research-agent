/**
 * ECCG relevance: how strongly a paper aligns with the taxonomy.
 *
 * Heuristic for V1:
 *   - tally keyword hits across all taxonomy categories,
 *   - weighted by category specificity (rarer keywords count more),
 *   - normalised so 0 = no signal, 1 = strong signal.
 *   - assigned eccg_category = the category whose keywords matched most.
 */

import type { Paper } from "../models";
import { TAXONOMY, ECCG_CORE_KEYWORDS } from "../taxonomy";

/**
 * Word-boundary aware count. Counts non-overlapping matches of phrase in text.
 * Avoids double-counting "tracking" when "feature tracking" already matched
 * because we match longest phrases first.
 */
function countPhrase(text: string, phrase: string): number {
  let count = 0;
  let from = 0;
  const p = phrase.toLowerCase();
  while (true) {
    const idx = text.indexOf(p, from);
    if (idx < 0) break;
    count++;
    from = idx + p.length;
  }
  return count;
}

export function assignRelevance(papers: Paper[]): void {
  for (const p of papers) {
    const title = p.title.toLowerCase();
    const abstract = p.abstract.toLowerCase();
    const text = `${title} ${abstract}`;

    // Core hit count (in {0, 1, 2}+ — strong signal)
    let coreHits = 0;
    for (const k of ECCG_CORE_KEYWORDS) {
      if (text.includes(k)) coreHits++;
    }

    // Per-category scores. Title matches weighted 2×. Longest phrase wins
    // when overlapping, so we sort keywords longest-first and consume the
    // text as we go to avoid double-counting "tracking" inside "feature tracking".
    let best = { slug: "", score: 0 };
    for (const cat of TAXONOMY) {
      let score = 0;
      let consumed = text;
      const keywords = [...cat.keywords].sort((a, b) => b.length - a.length);
      for (const k of keywords) {
        const titleHits = countPhrase(title, k.toLowerCase());
        score += titleHits * 2;
        const bodyHits = countPhrase(consumed.replace(title, ""), k.toLowerCase());
        score += bodyHits;
        // Strip matched phrases so a shorter substring doesn't re-match
        consumed = consumed.split(k.toLowerCase()).join("");
      }
      if (score > best.score) best = { slug: cat.slug, score };
    }

    const combined = Math.min(1, coreHits * 0.4 + best.score * 0.1);
    p.eccg_relevance = combined;
    p.eccg_category = best.score > 0 ? best.slug : undefined;
  }
}

export function topByCategory(papers: Paper[]): Record<string, Paper[]> {
  const out: Record<string, Paper[]> = {};
  for (const p of papers) {
    const slug = p.eccg_category ?? "unclassified";
    if (!out[slug]) out[slug] = [];
    out[slug].push(p);
  }
  return out;
}
