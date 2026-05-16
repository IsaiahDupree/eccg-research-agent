/**
 * Paper-mention extraction.
 *
 * Two strategies, run in tandem:
 *   1) Fast lexical: lower-cased substring match of paper titles and arxiv
 *      ids in the transcript. High precision, misses paraphrases.
 *   2) Optional LLM pass: prompts an LLM with the transcript + corpus catalog
 *      to surface mentions that the lexical pass missed (paraphrased titles,
 *      author-name shoutouts, etc.). Off by default to keep cost predictable.
 */

import type { Paper, PaperMention } from "../models";

export function extractMentionsLexical(
  transcript: string,
  papers: Paper[],
): PaperMention[] {
  if (!transcript) return [];
  const lower = transcript.toLowerCase();
  const out: PaperMention[] = [];
  const seen = new Set<string>();

  for (const p of papers) {
    // Match by arxiv id
    if (p.arxiv_id && lower.includes(p.arxiv_id.toLowerCase()) && !seen.has(p.id)) {
      seen.add(p.id);
      out.push({
        paper_id: p.id,
        title: p.title,
        excerpt: excerptAround(transcript, lower.indexOf(p.arxiv_id.toLowerCase()), 160),
      });
      continue;
    }
    // Match by short title (first 6 meaningful words) to keep matches strict
    const titleNeedle = shortTitle(p.title).toLowerCase();
    if (titleNeedle.length >= 12) {
      const idx = lower.indexOf(titleNeedle);
      if (idx >= 0 && !seen.has(p.id)) {
        seen.add(p.id);
        out.push({
          paper_id: p.id,
          title: p.title,
          excerpt: excerptAround(transcript, idx, 200),
        });
      }
    }
  }
  return out;
}

const LEADING_ARTICLES = new Set(["a", "an", "the"]);

function shortTitle(title: string): string {
  // Take the first N tokens of the title before any colon, dropping leading
  // articles. Picks a distinctive prefix likely to survive transcript
  // paraphrasing (e.g., "A Decade of Event-Based Vision" → "Decade of
  // Event-Based Vision").
  const head = title.split(/[:—]/)[0];
  const tokens = head
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 0 && LEADING_ARTICLES.has(tokens[0].toLowerCase())) {
    tokens.shift();
  }
  return tokens.slice(0, 5).join(" ");
}

function excerptAround(text: string, index: number, span: number): string {
  const start = Math.max(0, index - Math.floor(span / 2));
  const end = Math.min(text.length, start + span);
  let snip = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snip = "…" + snip;
  if (end < text.length) snip = snip + "…";
  return snip;
}
