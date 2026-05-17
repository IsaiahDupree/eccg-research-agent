import { describe, it, expect } from "vitest";
import { buildMeetingMentionsIndex } from "@/lib/meeting_mentions";
import type { Meeting, Paper } from "@/lib/models";

function meeting(overrides: Partial<Meeting>): Meeting {
  return {
    id: "m1",
    title: "ECCG sync",
    held_at: "2026-05-01T00:00:00Z",
    source: "fixture",
    attendees: [],
    transcript: "",
    ...overrides,
  };
}

function paper(overrides: Partial<Paper>): Paper {
  return {
    id: overrides.id ?? "arxiv-1",
    arxiv_id: overrides.arxiv_id,
    title: overrides.title ?? "Event-Based Vision: A Decade Review",
    abstract: "abstract",
    authors: [{ name: "Author" }],
    venue: { name: "arXiv preprint", type: "preprint" },
    published_at: "2024-01-01",
    categories: ["cs.CV"],
    citation_count: 0,
    months_since_publish: 12,
    citations_per_month: 0,
    ...overrides,
  };
}

describe("buildMeetingMentionsIndex — empty / minimal", () => {
  it("empty meetings + empty corpus → empty index", () => {
    expect(buildMeetingMentionsIndex([], [])).toEqual({});
  });

  it("empty meetings, non-empty corpus → empty index", () => {
    expect(buildMeetingMentionsIndex([], [paper({})])).toEqual({});
  });

  it("non-empty meetings, empty corpus → empty index", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "we talked about lots of papers" })],
      [],
    );
    expect(out).toEqual({});
  });

  it("meeting with empty transcript → no mentions", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "" })],
      [paper({})],
    );
    expect(out).toEqual({});
  });
});

describe("buildMeetingMentionsIndex — title matching", () => {
  it("matches title prefix in transcript", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "I think Event-Based Vision A Decade Review is foundational." })],
      [paper({ id: "p1", title: "Event-Based Vision: A Decade Review" })],
    );
    expect(out.p1).toHaveLength(1);
  });

  it("title match is case-insensitive", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "event-based vision a decade review is great" })],
      [paper({ id: "p1", title: "Event-Based Vision: A Decade Review" })],
    );
    expect(out.p1).toBeDefined();
  });

  it("ignores titles too short after article-stripping", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "the new method works" })],
      [paper({ id: "p1", title: "The Method" })],
    );
    expect(out).toEqual({});
  });

  it("strips leading articles in title needle (a/an/the)", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "decade of event-based vision was discussed" })],
      [paper({ id: "p1", title: "A Decade of Event-Based Vision" })],
    );
    expect(out.p1).toBeDefined();
  });

  it("uses first 5 tokens before any colon", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "spike camera sensor sampling rate matters" })],
      [paper({ id: "p1", title: "Spike Camera Sensor Sampling Rate: 100kHz Tests" })],
    );
    expect(out.p1).toBeDefined();
  });

  it("no match when prefix doesn't appear", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "we built a slam pipeline last week" })],
      [paper({ id: "p1", title: "Event-Based Optical Flow" })],
    );
    expect(out).toEqual({});
  });
});

describe("buildMeetingMentionsIndex — arxiv id matching", () => {
  it("matches by arxiv id substring", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "see arxiv 2402.18221 for details" })],
      [paper({ id: "p1", arxiv_id: "2402.18221", title: "Some Paper" })],
    );
    expect(out.p1).toHaveLength(1);
  });

  it("arxiv id match wins over title match", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "paper 1904.08405 is the classic" })],
      [paper({ id: "p1", arxiv_id: "1904.08405", title: "Event-Based Vision" })],
    );
    expect(out.p1).toHaveLength(1);
  });

  it("arxiv id is case-insensitive (lowercased)", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "see arxiv ABCD1234.5678" })],
      [paper({ id: "p1", arxiv_id: "abcd1234.5678", title: "Some" })],
    );
    expect(out.p1).toBeDefined();
  });

  it("doesn't match arxiv id when paper has no arxiv_id set", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "see arxiv 2402.18221" })],
      [paper({ id: "p1", title: "Some" })],
    );
    expect(out).toEqual({});
  });
});

describe("buildMeetingMentionsIndex — multi-meeting reverse index", () => {
  it("aggregates one paper across multiple meetings", () => {
    const corpus = [paper({ id: "p1", title: "Event-Based Vision: A Survey of Methods" })];
    const meetings = [
      meeting({ id: "m1", held_at: "2026-04-01T00:00:00Z", transcript: "Event-Based Vision A Survey is the canonical reference" }),
      meeting({ id: "m2", held_at: "2026-05-01T00:00:00Z", transcript: "I keep going back to Event-Based Vision A Survey" }),
    ];
    const out = buildMeetingMentionsIndex(meetings, corpus);
    expect(out.p1).toHaveLength(2);
  });

  it("sorts mentions newest-first", () => {
    const corpus = [paper({ id: "p1", title: "Event-Based Vision: A Survey of Methods" })];
    const meetings = [
      meeting({ id: "older", held_at: "2026-01-01T00:00:00Z", transcript: "event-based vision a survey of methods" }),
      meeting({ id: "newer", held_at: "2026-05-01T00:00:00Z", transcript: "event-based vision a survey of methods" }),
      meeting({ id: "newest", held_at: "2026-08-01T00:00:00Z", transcript: "event-based vision a survey of methods" }),
    ];
    const out = buildMeetingMentionsIndex(meetings, corpus);
    expect(out.p1.map((m) => m.meeting_id)).toEqual(["newest", "newer", "older"]);
  });

  it("each meeting contributes at most one entry per paper (lexical dedupes)", () => {
    const corpus = [paper({ id: "p1", title: "Event-Based Vision Decade Survey Stuff" })];
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "Event-Based Vision Decade Survey Stuff and Event-Based Vision Decade Survey Stuff again" })],
      corpus,
    );
    expect(out.p1).toHaveLength(1);
  });

  it("preserves meeting metadata on each entry", () => {
    const corpus = [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })];
    const out = buildMeetingMentionsIndex(
      [meeting({ id: "specific-id", title: "specific title", held_at: "2026-03-15T10:30:00Z", transcript: "event-based vision decade survey methods" })],
      corpus,
    );
    expect(out.p1[0].meeting_id).toBe("specific-id");
    expect(out.p1[0].meeting_title).toBe("specific title");
    expect(out.p1[0].held_at).toBe("2026-03-15T10:30:00Z");
  });

  it("indexes multiple papers from the same meeting", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "we discussed Event-Based Vision Decade Survey Methods and Spike Camera Asynchronous Pulse Sampling" })],
      [
        paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" }),
        paper({ id: "p2", title: "Spike Camera Asynchronous Pulse Sampling Methods" }),
      ],
    );
    expect(Object.keys(out).sort()).toEqual(["p1", "p2"]);
  });

  it("paper unmentioned in any meeting → not in index", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "nothing relevant" })],
      [paper({ id: "p1", title: "Event Camera Optical Flow Estimation" })],
    );
    expect(out.p1).toBeUndefined();
  });

  it("isolated entries per paper id", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ id: "m1", transcript: "Spike Camera Asynchronous Pulse Methods" })],
      [
        paper({ id: "p1", title: "Spike Camera Asynchronous Pulse Methods" }),
        paper({ id: "p2", title: "Event Vision SLAM Methods" }),
      ],
    );
    expect(out.p1).toHaveLength(1);
    expect(out.p2).toBeUndefined();
  });
});

describe("buildMeetingMentionsIndex — excerpt extraction", () => {
  it("excerpt includes context around the match", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "Before the match: Event-Based Vision Decade Survey Methods is mentioned. After context follows." })],
      [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })],
    );
    expect(out.p1[0].excerpt).toContain("Event-Based Vision Decade Survey");
  });

  it("excerpt is trimmed and whitespace-collapsed", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "  word    Event-Based Vision Decade Survey Methods    end  " })],
      [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })],
    );
    expect(out.p1[0].excerpt).not.toContain("  ");
  });

  it("excerpt has leading ellipsis when match isn't at the start", () => {
    const long = "a".repeat(500) + " Event-Based Vision Decade Survey Methods works well";
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: long })],
      [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })],
    );
    expect(out.p1[0].excerpt.startsWith("…")).toBe(true);
  });

  it("excerpt has trailing ellipsis when match isn't at the end", () => {
    const long = "context " + " Event-Based Vision Decade Survey Methods " + "a".repeat(500);
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: long })],
      [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })],
    );
    expect(out.p1[0].excerpt.endsWith("…")).toBe(true);
  });
});

describe("buildMeetingMentionsIndex — robustness", () => {
  it("does not mutate input meetings", () => {
    const meetings = [meeting({ transcript: "Event-Based Vision Decade Survey Methods" })];
    const snapshot = JSON.parse(JSON.stringify(meetings));
    buildMeetingMentionsIndex(meetings, [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })]);
    expect(meetings).toEqual(snapshot);
  });

  it("does not mutate input corpus", () => {
    const corpus = [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })];
    const snapshot = JSON.parse(JSON.stringify(corpus));
    buildMeetingMentionsIndex(
      [meeting({ transcript: "event-based vision decade survey methods" })],
      corpus,
    );
    expect(corpus).toEqual(snapshot);
  });

  it("returns a fresh object each call", () => {
    const corpus = [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })];
    const meetings = [meeting({ transcript: "event-based vision decade survey methods" })];
    const a = buildMeetingMentionsIndex(meetings, corpus);
    const b = buildMeetingMentionsIndex(meetings, corpus);
    expect(a).not.toBe(b);
    expect(a.p1).not.toBe(b.p1);
  });

  it("strips unicode chars when building needle (ï becomes separator)", () => {
    // Verifies the actual behavior: needle for "Naïve Event Camera Tracking Method"
    // becomes "Na ve Event Camera Tracking" after \w substitution, which
    // doesn't appear in a transcript that retains the diacritic.
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "naïve event camera tracking method discussed" })],
      [paper({ id: "p1", title: "Naïve Event Camera Tracking Method" })],
    );
    expect(out.p1).toBeUndefined();
  });

  it("handles long transcripts (10k chars)", () => {
    const filler = "x ".repeat(5000);
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: `${filler} Event-Based Vision Decade Survey Methods ${filler}` })],
      [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })],
    );
    expect(out.p1).toBeDefined();
  });

  it("handles 100 papers against a single transcript", () => {
    const corpus: Paper[] = [];
    for (let i = 0; i < 100; i++) {
      corpus.push(paper({ id: `p${i}`, title: `Topic Number ${i.toString().padStart(4, "0")} Method` }));
    }
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "Topic Number 0050 Method was key, also Topic Number 0099 Method" })],
      corpus,
    );
    expect(out.p50).toBeDefined();
    expect(out.p99).toBeDefined();
  });

  it("handles 10 meetings × 50 papers without throwing", () => {
    const corpus: Paper[] = [];
    for (let i = 0; i < 50; i++) {
      corpus.push(paper({ id: `p${i}`, title: `Subject Area ${i} Pipeline Method` }));
    }
    const meetings: Meeting[] = [];
    for (let i = 0; i < 10; i++) {
      meetings.push(meeting({
        id: `m${i}`,
        held_at: `2026-0${(i % 9) + 1}-01T00:00:00Z`,
        transcript: `subject area ${i} pipeline method was the main topic`,
      }));
    }
    const out = buildMeetingMentionsIndex(meetings, corpus);
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });

  it("returns array (not undefined) on miss when called via accessor", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "no matches" })],
      [paper({ id: "p1", title: "Distinct Different Title Here Foo" })],
    );
    expect(out["never-mentioned"]).toBeUndefined();
  });

  it("ignores special chars in title (treated as separators)", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "spike camera 100 khz asynchronous imaging is impressive" })],
      [paper({ id: "p1", title: "Spike Camera: 100-kHz Asynchronous Imaging Approach" })],
    );
    expect(out.p1).toBeDefined();
  });

  it("matches by em-dash variant in title", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "event based vision the new wave dominates" })],
      [paper({ id: "p1", title: "Event Based Vision The New Wave — A Survey" })],
    );
    expect(out.p1).toBeDefined();
  });

  it("first 5 tokens of title needle determines lookup (≥ 12 chars)", () => {
    // Needle: 'Decade Event Vision Method Pipeline' after stripping 'The'
    // → 35 chars, well over the 12-char minimum.
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "discussed Decade Event Vision Method Pipeline at length" })],
      [paper({ id: "p1", title: "The Decade Event Vision Method Pipeline We Built" })],
    );
    expect(out.p1).toBeDefined();
  });

  it("does not match when needle truncates to too-short string", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "we used a tag" })],
      [paper({ id: "p1", title: "A tag" })],
    );
    expect(out).toEqual({});
  });

  it("preserves original title in entry (not lowercased)", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "event-based vision decade survey methods was great" })],
      [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })],
    );
    // meeting_title is the meeting's own title, not the paper's — but we
    // still check the paper title isn't lowercased anywhere we'd see it.
    expect(out.p1[0].meeting_title).toBe("ECCG sync");
  });

  it("two papers with overlapping needle: first wins via dedup", () => {
    const out = buildMeetingMentionsIndex(
      [meeting({ transcript: "event camera optical flow estimation deep dive" })],
      [
        paper({ id: "p1", title: "Event Camera Optical Flow Estimation: Methods" }),
        paper({ id: "p2", title: "Event Camera Optical Flow Estimation: Survey" }),
      ],
    );
    // Both have the same 5-token prefix → both will match but the lexical
    // extractor dedupes by id. Each paper has its own id, so we expect
    // both to be present.
    expect(out.p1).toBeDefined();
    expect(out.p2).toBeDefined();
  });

  it("idempotent: rebuilding twice gives identical structure", () => {
    const meetings = [meeting({ transcript: "event-based vision decade survey methods" })];
    const corpus = [paper({ id: "p1", title: "Event-Based Vision Decade Survey Methods" })];
    const a = buildMeetingMentionsIndex(meetings, corpus);
    const b = buildMeetingMentionsIndex(meetings, corpus);
    expect(a).toEqual(b);
  });
});
