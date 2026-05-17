import { describe, it, expect } from "vitest";
import {
  NICHES,
  DEFAULT_NICHE,
  findNiche,
  matchesNiche,
  type NicheConfig,
} from "@/lib/niches";

describe("NICHES — fixture integrity", () => {
  it("contains at least one niche", () => {
    expect(NICHES.length).toBeGreaterThan(0);
  });

  it("DEFAULT_NICHE is the first entry", () => {
    expect(DEFAULT_NICHE).toBe(NICHES[0]);
  });

  it("default niche is event_camera (founding niche)", () => {
    expect(DEFAULT_NICHE.slug).toBe("event_camera");
  });

  it("every niche has a non-empty slug", () => {
    for (const n of NICHES) {
      expect(typeof n.slug).toBe("string");
      expect(n.slug.length).toBeGreaterThan(0);
    }
  });

  it("every niche has a non-empty label", () => {
    for (const n of NICHES) {
      expect(typeof n.label).toBe("string");
      expect(n.label.length).toBeGreaterThan(0);
    }
  });

  it("every niche has a non-empty description", () => {
    for (const n of NICHES) {
      expect(typeof n.description).toBe("string");
      expect(n.description.length).toBeGreaterThan(0);
    }
  });

  it("every niche has at least one core_keyword", () => {
    for (const n of NICHES) {
      expect(n.core_keywords.length).toBeGreaterThan(0);
    }
  });

  it("every niche has at least one arxiv_category", () => {
    for (const n of NICHES) {
      expect(n.arxiv_categories.length).toBeGreaterThan(0);
    }
  });

  it("slugs are unique across niches", () => {
    const seen = new Set<string>();
    for (const n of NICHES) {
      expect(seen.has(n.slug)).toBe(false);
      seen.add(n.slug);
    }
  });

  it("slugs are URL-safe (no slashes, spaces, or special chars)", () => {
    for (const n of NICHES) {
      expect(n.slug).toMatch(/^[a-z0-9_-]+$/);
    }
  });

  it("arxiv_categories follow the typical 'cs.XX' or 'physics.XX' shape", () => {
    for (const n of NICHES) {
      for (const cat of n.arxiv_categories) {
        expect(cat).toMatch(/^[a-z]+\.[a-z-]+$/i);
      }
    }
  });

  it("core_keywords are lower-cased (matchesNiche assumes this)", () => {
    for (const n of NICHES) {
      for (const k of n.core_keywords) {
        expect(k).toBe(k.toLowerCase());
      }
    }
  });
});

describe("findNiche", () => {
  it("returns the matching niche by slug", () => {
    const n = findNiche("event_camera");
    expect(n.slug).toBe("event_camera");
  });

  it("returns DEFAULT_NICHE for unknown slug", () => {
    expect(findNiche("unknown_xyz")).toBe(DEFAULT_NICHE);
  });

  it("returns DEFAULT_NICHE for null", () => {
    expect(findNiche(null)).toBe(DEFAULT_NICHE);
  });

  it("returns DEFAULT_NICHE for undefined", () => {
    expect(findNiche(undefined)).toBe(DEFAULT_NICHE);
  });

  it("returns DEFAULT_NICHE for empty string", () => {
    expect(findNiche("")).toBe(DEFAULT_NICHE);
  });

  it("is case-insensitive", () => {
    expect(findNiche("EVENT_CAMERA").slug).toBe("event_camera");
    expect(findNiche("Event_Camera").slug).toBe("event_camera");
  });

  it("returns the same reference for the same slug", () => {
    expect(findNiche("event_camera")).toBe(findNiche("event_camera"));
  });

  it("finds spike_camera", () => {
    const n = findNiche("spike_camera");
    expect(n.slug).toBe("spike_camera");
  });

  it("finds neuromorphic_compute", () => {
    const n = findNiche("neuromorphic_compute");
    expect(n.slug).toBe("neuromorphic_compute");
  });

  it("an unknown slug doesn't throw", () => {
    expect(() => findNiche("xyz123")).not.toThrow();
  });
});

describe("matchesNiche — default niche permissiveness", () => {
  it("returns true for ANY text in the founding niche", () => {
    expect(matchesNiche("totally unrelated content", DEFAULT_NICHE)).toBe(true);
  });

  it("returns true for empty text in the founding niche", () => {
    expect(matchesNiche("", DEFAULT_NICHE)).toBe(true);
  });

  it("returns true for matching text in the founding niche", () => {
    expect(matchesNiche("event camera method", DEFAULT_NICHE)).toBe(true);
  });

  it("returns true for short-circuit on event_camera regardless of keywords", () => {
    expect(matchesNiche("123", DEFAULT_NICHE)).toBe(true);
  });
});

describe("matchesNiche — sibling niche keyword filter", () => {
  const spike = findNiche("spike_camera");
  const neuro = findNiche("neuromorphic_compute");

  it("returns true when text contains a spike_camera core keyword", () => {
    expect(matchesNiche("we used a spike camera", spike)).toBe(true);
  });

  it("returns false when text doesn't match any keyword", () => {
    expect(matchesNiche("event camera method", spike)).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(matchesNiche("Spike Camera Method", spike)).toBe(true);
  });

  it("matches keywords embedded in larger words (substring)", () => {
    // matchesNiche uses .includes() — substring is enough
    expect(matchesNiche("vidar-style camera", spike)).toBe(true);
  });

  it("returns false on empty text for sibling niche", () => {
    expect(matchesNiche("", spike)).toBe(false);
  });

  it("any one keyword is enough", () => {
    const cfg: NicheConfig = {
      slug: "test_niche",
      label: "Test",
      description: "",
      core_keywords: ["alpha", "beta", "gamma"],
      arxiv_categories: ["cs.CV"],
    };
    expect(matchesNiche("we used gamma transform", cfg)).toBe(true);
  });

  it("requires no specific keyword — any match wins", () => {
    const cfg: NicheConfig = {
      slug: "test_niche",
      label: "Test",
      description: "",
      core_keywords: ["alpha", "beta"],
      arxiv_categories: ["cs.CV"],
    };
    expect(matchesNiche("alpha", cfg)).toBe(true);
    expect(matchesNiche("beta", cfg)).toBe(true);
  });

  it("returns false when none of the keywords appear", () => {
    const cfg: NicheConfig = {
      slug: "test_niche",
      label: "Test",
      description: "",
      core_keywords: ["alpha", "beta"],
      arxiv_categories: ["cs.CV"],
    };
    expect(matchesNiche("delta gamma omega", cfg)).toBe(false);
  });

  it("preserves the keyword exact characters (no stemming)", () => {
    const cfg: NicheConfig = {
      slug: "test_niche",
      label: "Test",
      description: "",
      core_keywords: ["walked"],
      arxiv_categories: ["cs.CV"],
    };
    // "walking" doesn't include "walked"
    expect(matchesNiche("walking method", cfg)).toBe(false);
    expect(matchesNiche("walked path", cfg)).toBe(true);
  });

  it("works with multi-word keywords", () => {
    const cfg: NicheConfig = {
      slug: "test_niche",
      label: "Test",
      description: "",
      core_keywords: ["asynchronous vision"],
      arxiv_categories: ["cs.CV"],
    };
    expect(matchesNiche("we built an asynchronous vision pipeline", cfg)).toBe(true);
    expect(matchesNiche("vision asynchronous swap", cfg)).toBe(false);
  });

  it("neuromorphic niche matches SNN keyword", () => {
    expect(matchesNiche("we propose an SNN architecture", neuro)).toBe(true);
  });

  it("neuromorphic niche matches Loihi keyword", () => {
    expect(matchesNiche("the Loihi chip executes 10W", neuro)).toBe(true);
  });

  it("neuromorphic niche doesn't match unrelated text", () => {
    expect(matchesNiche("event-based optical flow is fast", neuro)).toBe(false);
  });

  it("matches keyword at the very start of text", () => {
    expect(matchesNiche("spike camera fundamentals", spike)).toBe(true);
  });

  it("matches keyword at the very end of text", () => {
    expect(matchesNiche("the new sensor is a spike camera", spike)).toBe(true);
  });

  it("matches with punctuation around keyword", () => {
    expect(matchesNiche("results: spike camera, 100kHz, 6.5 megapixels", spike)).toBe(true);
  });

  it("matches with newline-separated keyword context", () => {
    expect(matchesNiche("...\nspike camera readout\n...", spike)).toBe(true);
  });
});

describe("matchesNiche — robustness", () => {
  const spike = findNiche("spike_camera");

  it("does not mutate the niche config", () => {
    const before = JSON.parse(JSON.stringify(spike));
    matchesNiche("anything", spike);
    expect(spike).toEqual(before);
  });

  it("idempotent across calls", () => {
    expect(matchesNiche("spike camera", spike)).toBe(true);
    expect(matchesNiche("spike camera", spike)).toBe(true);
    expect(matchesNiche("spike camera", spike)).toBe(true);
  });

  it("returns boolean (not truthy/falsy non-bool)", () => {
    expect(typeof matchesNiche("anything", spike)).toBe("boolean");
  });

  it("works with very long text", () => {
    const long = "x ".repeat(5000) + "spike camera " + "y ".repeat(5000);
    expect(matchesNiche(long, spike)).toBe(true);
  });

  it("never throws for empty config keywords", () => {
    const cfg: NicheConfig = {
      slug: "empty",
      label: "Empty",
      description: "",
      core_keywords: [],
      arxiv_categories: ["cs.CV"],
    };
    expect(() => matchesNiche("text", cfg)).not.toThrow();
    expect(matchesNiche("text", cfg)).toBe(false);
  });

  it("handles unicode characters in text", () => {
    expect(matchesNiche("a vidar Sensor with naïve filtering", findNiche("spike_camera"))).toBe(
      true,
    );
  });
});
