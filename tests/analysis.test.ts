import { describe, it, expect } from "vitest";
import {
  computeVelocitySignals,
  detectOutliers,
  deriveCitationsPerMonth,
} from "@/lib/analysis/citation_velocity";
import { computeNoveltySignals } from "@/lib/analysis/novelty";
import { assignRelevance } from "@/lib/analysis/relevance";
import type { Paper } from "@/lib/models";

function makePaper(overrides: Partial<Paper>): Paper {
  return {
    id: "x",
    title: "An event camera method",
    abstract: "We propose a new event-camera approach for object detection on DVS data.",
    authors: [{ name: "Test Author" }],
    venue: { name: "CVPR", type: "conference" },
    published_at: "2024-01-01T00:00:00Z",
    categories: ["cs.CV"],
    citation_count: 0,
    months_since_publish: 6,
    citations_per_month: 0,
    ...overrides,
  };
}

describe("citation velocity", () => {
  it("derives cpm = citations / months", () => {
    const ps = [
      makePaper({ id: "a", citation_count: 12, months_since_publish: 6 }),
      makePaper({ id: "b", citation_count: 0, months_since_publish: 0 }),
    ];
    deriveCitationsPerMonth(ps);
    expect(ps[0].citations_per_month).toBe(2);
    expect(ps[1].citations_per_month).toBe(0);
  });

  it("identifies outliers above baseline multiplier", () => {
    const ps = [
      makePaper({ id: "a", citation_count: 60, months_since_publish: 6 }), // 10/mo
      makePaper({ id: "b", citation_count: 6, months_since_publish: 6 }),  // 1/mo
      makePaper({ id: "c", citation_count: 6, months_since_publish: 6 }),
      makePaper({ id: "d", citation_count: 6, months_since_publish: 6 }),
    ];
    deriveCitationsPerMonth(ps);
    const vels = computeVelocitySignals(ps);
    const outliers = detectOutliers(vels, 3);
    expect(outliers.find((v) => v.paper_id === "a")).toBeDefined();
    expect(outliers.find((v) => v.paper_id === "b")).toBeUndefined();
  });
});

describe("novelty", () => {
  it("returns a signal per paper", () => {
    const ps = [
      makePaper({ id: "a", title: "Event-based optical flow", abstract: "Optical flow on event streams." }),
      makePaper({ id: "b", title: "Event-based optical flow", abstract: "Optical flow on event streams." }),
      makePaper({ id: "c", title: "Spiking object detection on Loihi", abstract: "Neuromorphic chip deployment for detection." }),
    ];
    const sigs = computeNoveltySignals(ps);
    expect(sigs).toHaveLength(3);
    // C is the unique outlier topic — should score most novel
    const cNov = sigs.find((s) => s.paper_id === "c")!.novelty;
    const aNov = sigs.find((s) => s.paper_id === "a")!.novelty;
    expect(cNov).toBeGreaterThanOrEqual(aNov);
  });
});

describe("relevance", () => {
  it("assigns high relevance to clearly event-camera papers and a category", () => {
    const p = makePaper({
      title: "Event-based SLAM with DVS",
      abstract: "We present a SLAM system for event cameras using DVS data and visual-inertial odometry.",
    });
    assignRelevance([p]);
    expect(p.eccg_relevance ?? 0).toBeGreaterThan(0.4);
    expect(p.eccg_category).toBe("slam");
  });

  it("assigns low relevance to unrelated papers", () => {
    const p = makePaper({
      title: "A study on greenhouse gas emissions",
      abstract: "We study climate change effects on coral reefs.",
      categories: ["q-bio"],
    });
    assignRelevance([p]);
    expect(p.eccg_relevance ?? 0).toBe(0);
  });
});
