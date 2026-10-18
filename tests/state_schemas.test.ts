import { describe, it, expect, vi } from "vitest";
import {
  CustomCorpusSchema,
  VotesStateSchema,
  LibraryStateSchema,
  NotesStateSchema,
  AuditStateSchema,
  PaperSchema,
  safeParseDriveState,
} from "@/lib/state_schemas";

const MINIMAL_PAPER = {
  id: "arxiv-1",
  title: "Sample",
  abstract: "Body",
  authors: [{ name: "A" }],
  published_at: "2024-01-01T00:00:00Z",
  categories: ["cs.CV"],
  citation_count: 0,
  months_since_publish: 6,
  citations_per_month: 0,
};

describe("PaperSchema", () => {
  it("accepts a minimal valid paper", () => {
    expect(PaperSchema.safeParse(MINIMAL_PAPER).success).toBe(true);
  });

  it("rejects when id is missing", () => {
    const { id: _unused, ...rest } = MINIMAL_PAPER;
    void _unused;
    expect(PaperSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects when title is missing", () => {
    expect(
      PaperSchema.safeParse({ ...MINIMAL_PAPER, title: undefined }).success,
    ).toBe(false);
  });

  it("rejects when authors is not an array", () => {
    expect(
      PaperSchema.safeParse({ ...MINIMAL_PAPER, authors: "Alice" }).success,
    ).toBe(false);
  });

  it("rejects an unknown venue.type", () => {
    expect(
      PaperSchema.safeParse({
        ...MINIMAL_PAPER,
        venue: { name: "X", type: "tweet" },
      }).success,
    ).toBe(false);
  });

  it("accepts a paper with optional fields populated", () => {
    expect(
      PaperSchema.safeParse({
        ...MINIMAL_PAPER,
        doi: "10.1000/x",
        s2_id: "abc",
        pdf_url: "https://x.com/p.pdf",
        eccg_relevance: 0.7,
        eccg_category: "slam",
      }).success,
    ).toBe(true);
  });

  it("defaults abstract to empty string when missing", () => {
    const out = PaperSchema.parse({
      ...MINIMAL_PAPER,
      abstract: undefined,
    });
    expect(out.abstract).toBe("");
  });
});

describe("CustomCorpusSchema", () => {
  const entry = {
    paper: MINIMAL_PAPER,
    score_base: 50,
    uploaded_by: "alice",
    uploaded_at: "2024-01-01T00:00:00Z",
    source_file: "spreadsheet",
  };

  it("accepts an empty array", () => {
    expect(CustomCorpusSchema.safeParse([]).success).toBe(true);
  });

  it("accepts a valid record", () => {
    expect(CustomCorpusSchema.safeParse([entry]).success).toBe(true);
  });

  it("accepts approved/pending/rejected status", () => {
    for (const s of ["approved", "pending", "rejected"] as const) {
      expect(
        CustomCorpusSchema.safeParse([{ ...entry, status: s }]).success,
      ).toBe(true);
    }
  });

  it("rejects bogus status value", () => {
    expect(
      CustomCorpusSchema.safeParse([{ ...entry, status: "maybe" }]).success,
    ).toBe(false);
  });

  it("rejects missing paper.id deep in the record", () => {
    const bad = { ...entry, paper: { ...MINIMAL_PAPER, id: undefined } };
    expect(CustomCorpusSchema.safeParse([bad]).success).toBe(false);
  });

  it("rejects non-array root", () => {
    expect(CustomCorpusSchema.safeParse({ records: [] }).success).toBe(false);
  });
});

describe("VotesStateSchema", () => {
  const tally = {
    upvotes: 1,
    downvotes: 0,
    net: 1,
    voters: [{ voter: "alice", value: 1 as const, voted_at: "2024-01-01" }],
  };

  it("accepts an empty record", () => {
    expect(VotesStateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a tally", () => {
    expect(VotesStateSchema.safeParse({ "arxiv-1": tally }).success).toBe(true);
  });

  it("rejects vote with value=0 (allowed only -1 | 1)", () => {
    const bad = { ...tally, voters: [{ voter: "x", value: 0, voted_at: "2024-01-01" }] };
    expect(VotesStateSchema.safeParse({ p: bad }).success).toBe(false);
  });

  it("rejects vote with value=2", () => {
    const bad = { ...tally, voters: [{ voter: "x", value: 2, voted_at: "2024-01-01" }] };
    expect(VotesStateSchema.safeParse({ p: bad }).success).toBe(false);
  });

  it("defaults voters to empty array when missing", () => {
    const out = VotesStateSchema.parse({
      p: { upvotes: 0, downvotes: 0, net: 0 },
    });
    expect(out.p.voters).toEqual([]);
  });

  it("accepts optional reason on a vote", () => {
    const t = {
      ...tally,
      voters: [{ voter: "x", value: 1, reason: "great paper", voted_at: "2024-01-01" }],
    };
    expect(VotesStateSchema.safeParse({ p: t }).success).toBe(true);
  });
});

describe("LibraryStateSchema", () => {
  const item = {
    paper_id: "arxiv-1",
    added_by: "alice",
    added_at: "2024-01-01",
  };

  it("accepts empty array", () => {
    expect(LibraryStateSchema.safeParse([]).success).toBe(true);
  });

  it("accepts valid items", () => {
    expect(LibraryStateSchema.safeParse([item]).success).toBe(true);
  });

  it("accepts optional tags", () => {
    expect(
      LibraryStateSchema.safeParse([{ ...item, tags: ["foo", "bar"] }]).success,
    ).toBe(true);
  });

  it("rejects when paper_id is missing", () => {
    const { paper_id: _u, ...rest } = item;
    void _u;
    expect(LibraryStateSchema.safeParse([rest]).success).toBe(false);
  });

  it("rejects when tags is not array of strings", () => {
    expect(
      LibraryStateSchema.safeParse([{ ...item, tags: [1, 2, 3] }]).success,
    ).toBe(false);
  });
});

describe("NotesStateSchema", () => {
  const note = {
    id: "uuid-1",
    paper_id: "arxiv-1",
    author: "alice",
    body: "interesting",
    created_at: "2024-01-01",
  };

  it("accepts empty object", () => {
    expect(NotesStateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts note array per paper", () => {
    expect(NotesStateSchema.safeParse({ "arxiv-1": [note] }).success).toBe(true);
  });

  it("rejects when note missing required fields", () => {
    const bad = { ...note, body: undefined };
    expect(NotesStateSchema.safeParse({ p: [bad] }).success).toBe(false);
  });

  it("rejects when paper key maps to non-array", () => {
    expect(NotesStateSchema.safeParse({ p: note }).success).toBe(false);
  });
});

describe("AuditStateSchema", () => {
  const entry = {
    at: "2024-01-01",
    actor: "alice",
    action: "approve" as const,
    paper_ids: ["arxiv-1"],
    source: "single" as const,
  };

  it("accepts empty array", () => {
    expect(AuditStateSchema.safeParse([]).success).toBe(true);
  });

  it("accepts a single-paper approve", () => {
    expect(AuditStateSchema.safeParse([entry]).success).toBe(true);
  });

  it("accepts a bulk_category reject with note", () => {
    expect(
      AuditStateSchema.safeParse([
        { ...entry, action: "reject", source: "bulk_category", category: "slam", note: "off-topic" },
      ]).success,
    ).toBe(true);
  });

  it("rejects bogus action", () => {
    expect(
      AuditStateSchema.safeParse([{ ...entry, action: "delete" }]).success,
    ).toBe(false);
  });

  it("rejects bogus source", () => {
    expect(
      AuditStateSchema.safeParse([{ ...entry, source: "drag-drop" }]).success,
    ).toBe(false);
  });

  it("rejects non-array paper_ids", () => {
    expect(
      AuditStateSchema.safeParse([{ ...entry, paper_ids: "arxiv-1" }]).success,
    ).toBe(false);
  });
});

describe("safeParseDriveState", () => {
  it("returns the parsed value when schema matches", () => {
    const r = safeParseDriveState("test", [], CustomCorpusSchema, []);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual([]);
  });

  it("returns the fallback when schema fails", () => {
    const r = safeParseDriveState(
      "test",
      [{ shape: "wrong" }],
      CustomCorpusSchema,
      [],
    );
    expect(r.ok).toBe(false);
    expect(r.value).toEqual([]);
    expect(r.errors).toBeDefined();
  });

  it("logs a warning to console on failure", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    safeParseDriveState("test", "garbage", CustomCorpusSchema, []);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not log on success", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    safeParseDriveState("test", [], CustomCorpusSchema, []);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns the supplied fallback when raw is null", () => {
    const r = safeParseDriveState("test", null, CustomCorpusSchema, []);
    expect(r.ok).toBe(false);
    expect(r.value).toEqual([]);
  });

  it("preserves the fallback reference (not deep-copied)", () => {
    const fallback: never[] = [];
    const r = safeParseDriveState("test", null, CustomCorpusSchema, fallback);
    expect(r.value).toBe(fallback);
  });

  it("returns up to 5 error messages on failure", () => {
    const bad = Array.from({ length: 10 }, () => ({ shape: "wrong" }));
    const r = safeParseDriveState("test", bad, CustomCorpusSchema, []);
    expect(r.errors?.length).toBeLessThanOrEqual(5);
  });

  it("does not throw on totally unexpected input", () => {
    expect(() =>
      safeParseDriveState("test", 12345, CustomCorpusSchema, []),
    ).not.toThrow();
  });
});
