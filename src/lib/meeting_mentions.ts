/**
 * Reverse index of paper_id → meetings that mention this paper.
 *
 * Built once per cold start by walking every fixture meeting transcript
 * and running the lexical-mention extractor against the corpus. Memoized
 * in module scope. Cheap enough at the current fixture scale (5 meetings
 * × 1,300 papers); when the meeting count grows past ~50, precompute
 * offline and ship as a fixture.
 */

import { extractMentionsLexical } from "./analysis/paper_mentions";
import type { Meeting, Paper } from "./models";
import { loadSeedPipeline } from "./seed";
import { loadSeedMeetings } from "./seed_meetings";

export interface MeetingMentionEntry {
  meeting_id: string;
  meeting_title: string;
  held_at: string;
  excerpt: string;
}

let cached: Record<string, MeetingMentionEntry[]> | null = null;

export function getMeetingMentionsFor(paperId: string): MeetingMentionEntry[] {
  if (!cached) {
    cached = buildMeetingMentionsIndex(loadSeedMeetings(), loadSeedPipeline().raw.papers);
  }
  return cached[paperId] ?? [];
}

/** Test-only: clear the memoised cache so a fresh build runs. */
export function __resetMeetingMentionsCache(): void {
  cached = null;
}

/**
 * Pure builder — takes meetings + corpus, returns the paper_id → meetings
 * reverse index. Tests inject controlled fixtures here instead of going
 * through the seed loaders.
 */
export function buildMeetingMentionsIndex(
  meetings: Meeting[],
  corpus: Paper[],
): Record<string, MeetingMentionEntry[]> {
  const out: Record<string, MeetingMentionEntry[]> = {};
  for (const m of meetings) {
    const mentions = extractMentionsLexical(m.transcript, corpus);
    for (const mention of mentions) {
      if (!out[mention.paper_id]) out[mention.paper_id] = [];
      out[mention.paper_id].push({
        meeting_id: m.id,
        meeting_title: m.title,
        held_at: m.held_at,
        excerpt: mention.excerpt,
      });
    }
  }
  // Sort each list by recency (newest meeting first)
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => b.held_at.localeCompare(a.held_at));
  }
  return out;
}
