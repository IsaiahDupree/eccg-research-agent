import { describe, it, expect } from "vitest";
import { Scorer } from "@/lib/scoring/rubric";
import { DEFAULT_RUBRIC } from "@/lib/scoring/weights";
import type { Paper } from "@/lib/models";

function p(overrides: Partial<Paper>): Paper {
  return {
    id: "x",
    title: "T",
    abstract: "A",
    authors: [{ name: "A", h_index: 30 }],
    venue: { name: "CVPR", type: "conference" },
    published_at: "2024-01-01T00:00:00Z",
    categories: ["cs.CV"],
    citation_count: 24,
    months_since_publish: 6,
    citations_per_month: 4,
    eccg_relevance: 0.9,
    eccg_category: "slam",
    ...overrides,
  };
}

describe("rubric", () => {
  it("totals weights to 100", () => {
    const sum = DEFAULT_RUBRIC.categories.reduce((s, c) => s + c.weight, 0);
    expect(sum).toBe(100);
  });

  it("scores a strong paper above 50", () => {
    const s = new Scorer();
    const out = s.score({
      paper: p({}),
      velocity: { paper_id: "x", citations_per_month: 4, venue_baseline_cpm: 1, multiplier: 4 },
      novelty: { paper_id: "x", novelty: 0.7 },
    });
    expect(out.total).toBeGreaterThan(50);
    expect(out.categories.length).toBe(DEFAULT_RUBRIC.categories.length);
  });

  it("scores a weak paper below 40", () => {
    const s = new Scorer();
    const out = s.score({
      paper: p({
        citation_count: 0,
        citations_per_month: 0,
        eccg_relevance: 0.1,
        eccg_category: undefined,
        authors: [{ name: "A" }],
        venue: { name: "arXiv preprint", type: "preprint" },
        months_since_publish: 24,
      }),
      velocity: { paper_id: "x", citations_per_month: 0, venue_baseline_cpm: 1, multiplier: 0 },
      novelty: { paper_id: "x", novelty: 0.2 },
    });
    expect(out.total).toBeLessThan(40);
  });
});
