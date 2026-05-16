import { describe, it, expect } from "vitest";
import { loadSeedMeetings, loadSeedMeetingDigests } from "@/lib/seed_meetings";
import { extractMentionsLexical } from "@/lib/analysis/paper_mentions";
import { loadSeedPipeline } from "@/lib/seed";

describe("seed meetings", () => {
  it("ships at least one fixture meeting", () => {
    const ms = loadSeedMeetings();
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) {
      expect(m.id).toBeTruthy();
      expect(m.transcript.length).toBeGreaterThan(50);
      expect(m.attendees.length).toBeGreaterThan(0);
    }
  });

  it("digests each fixture without LLM and detects paper mentions", () => {
    const digests = loadSeedMeetingDigests();
    expect(digests.length).toBeGreaterThan(0);
    for (const d of digests) {
      expect(d.tldr).toBeTruthy();
      expect(d.topics.length).toBeGreaterThan(0);
      expect(d.model).toBe("fixture/static");
    }
    // At least one fixture talks about real seed papers
    const total = digests.reduce((s, d) => s + d.paper_mentions.length, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("paper-mention lexical extractor", () => {
  const corpus = loadSeedPipeline().raw.papers;

  it("matches by leading title phrase", () => {
    const transcript = "Today we cover A Decade of Event-Based Vision survey in detail.";
    const mentions = extractMentionsLexical(transcript, corpus);
    expect(mentions.some((m) => m.title.includes("Decade of Event-Based Vision"))).toBe(true);
  });

  it("matches by arXiv id", () => {
    const transcript = "Check out arxiv 2403.11421 — they got Loihi on a drone.";
    const mentions = extractMentionsLexical(transcript, corpus);
    expect(mentions.some((m) => m.paper_id === "arxiv-2403.11421")).toBe(true);
  });

  it("returns empty for unrelated transcripts", () => {
    expect(extractMentionsLexical("Random conversation about pizza.", corpus)).toEqual([]);
  });
});
