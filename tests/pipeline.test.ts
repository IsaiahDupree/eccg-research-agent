import { describe, it, expect } from "vitest";
import { runPipeline } from "@/lib/pipeline";
import { loadSeedPipeline } from "@/lib/seed";

describe("seed pipeline", () => {
  it("loads seed corpus and scores every paper", () => {
    const result = loadSeedPipeline();
    expect(result.scored.length).toBeGreaterThanOrEqual(5);
    for (const s of result.scored) {
      expect(s.total).toBeGreaterThan(0);
      expect(s.categories.length).toBeGreaterThan(0);
    }
  });

  it("sorts top score descending", () => {
    const result = loadSeedPipeline();
    for (let i = 1; i < result.scored.length; i++) {
      expect(result.scored[i - 1].total).toBeGreaterThanOrEqual(result.scored[i].total);
    }
  });

  it("classifies the survey paper as 'survey'", () => {
    const result = loadSeedPipeline();
    const survey = result.scored.find((s) => /Decade of Event-Based/i.test(s.paper.title));
    expect(survey).toBeDefined();
    expect(survey!.paper.eccg_category).toBe("survey");
  });
});

describe("runPipeline with overrides + fixture digest", () => {
  it("works without network using fixture digest path", async () => {
    const seed = loadSeedPipeline();
    const result = await runPipeline({
      papersOverride: seed.raw.papers,
      useFixtureDigest: true,
      topN: 3,
    });
    expect(result.scored.length).toBe(seed.raw.papers.length);
    expect(result.digests.length).toBe(3);
    for (const d of result.digests) {
      expect(d.tldr).toBeTruthy();
      expect(d.model).toBe("fixture/static");
    }
  });
});
