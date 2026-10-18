/**
 * Citation velocity + outlier analysis.
 *
 * Velocity = citations / months_since_publish. The baseline against which we
 * judge a paper is the median CPM of other papers in its venue (or the corpus
 * if venue baseline is thin). A paper whose CPM exceeds N× its baseline is an
 * outlier — the event-camera equivalent of yt-research-agent's 1-of-10 video
 * outlier rule.
 */

import type { CitationVelocitySignal, Paper } from "../models";

export const OUTLIER_MULTIPLIER = 3; // 3× venue median is "punching above weight"

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function deriveCitationsPerMonth(papers: Paper[]): void {
  for (const p of papers) {
    if (p.months_since_publish > 0 && p.citation_count > 0) {
      p.citations_per_month = p.citation_count / p.months_since_publish;
    } else {
      p.citations_per_month = 0;
    }
  }
}

export function computeVelocitySignals(papers: Paper[]): CitationVelocitySignal[] {
  // Venue baseline: median citations_per_month within a venue
  const byVenue = new Map<string, number[]>();
  for (const p of papers) {
    const v = p.venue?.name ?? "unknown";
    if (!byVenue.has(v)) byVenue.set(v, []);
    byVenue.get(v)!.push(p.citations_per_month);
  }
  const venueBaseline = new Map<string, number>();
  for (const [v, cpms] of byVenue) {
    venueBaseline.set(v, median(cpms));
  }
  const corpusBaseline = median(papers.map((p) => p.citations_per_month));

  return papers.map((p) => {
    const venue = p.venue?.name ?? "unknown";
    // Use venue median if we have at least 3 papers in that venue, else corpus
    const base =
      (byVenue.get(venue)?.length ?? 0) >= 3
        ? venueBaseline.get(venue) ?? corpusBaseline
        : corpusBaseline;
    const safeBase = base > 0 ? base : 0.01;
    return {
      paper_id: p.id,
      citations_per_month: p.citations_per_month,
      venue_baseline_cpm: safeBase,
      multiplier: p.citations_per_month / safeBase,
    };
  });
}

export function detectOutliers(
  velocities: CitationVelocitySignal[],
  threshold = OUTLIER_MULTIPLIER,
): CitationVelocitySignal[] {
  return velocities.filter((v) => v.multiplier >= threshold);
}
