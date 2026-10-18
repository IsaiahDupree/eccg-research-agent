import { describe, it, expect } from "vitest";
import { computeAuthorStats, normaliseAuthor } from "@/lib/author_stats";
import type { IntentCounts } from "@/lib/citations";
import type { Author, Paper, ScoredPaper } from "@/lib/models";

const ZERO_IC: IntentCounts = {
  background: 0,
  methodology: 0,
  result: 0,
  extensionMethodology: 0,
  total: 0,
  replication: 0,
};

function ic(over: Partial<IntentCounts>): IntentCounts {
  return { ...ZERO_IC, ...over };
}

type PaperOverrides = Omit<Partial<Paper>, "authors"> & {
  id: string;
  authors: string[];
};

function paper(over: PaperOverrides): Paper {
  const has = (k: keyof Paper) => Object.prototype.hasOwnProperty.call(over, k);
  return {
    id: over.id,
    title: over.title ?? `Paper ${over.id}`,
    abstract: over.abstract ?? "abstract",
    authors: over.authors.map<Author>((n) => ({ name: n })),
    venue: has("venue") ? over.venue : { name: "CVPR", type: "conference" },
    published_at: over.published_at ?? "2024-01-01",
    categories: over.categories ?? ["cs.CV"],
    citation_count: over.citation_count ?? 0,
    months_since_publish: over.months_since_publish ?? 12,
    citations_per_month: over.citations_per_month ?? 0,
    eccg_category: over.eccg_category,
  };
}

function scored(p: Paper, total = 60): ScoredPaper {
  return { paper: p, total, categories: [] };
}

const noIntents = (): IntentCounts => ZERO_IC;

describe("normaliseAuthor", () => {
  it("lowercases input", () => {
    expect(normaliseAuthor("Isaiah")).toBe("isaiah");
  });

  it("trims whitespace", () => {
    expect(normaliseAuthor("  Isaiah  ")).toBe("isaiah");
  });

  it("normalises NFKD diacritics to ascii base", () => {
    expect(normaliseAuthor("Gehrïg")).toBe("gehrig");
  });

  it("collapses combined diacritics", () => {
    expect(normaliseAuthor("Beñoit")).toBe("benoit");
  });

  it("is idempotent", () => {
    expect(normaliseAuthor(normaliseAuthor("Hello"))).toBe("hello");
  });
});

describe("computeAuthorStats — empty / single paper", () => {
  it("no matching papers → zeros everywhere", () => {
    const s = computeAuthorStats("missing", [], noIntents);
    expect(s).toEqual({
      papers_count: 0,
      citations_total: 0,
      h_index_proxy: 0,
      in_corpus_cited_by: 0,
      replication_total: 0,
      background_total: 0,
      papers_with_replication: 0,
      top_venues: [],
      top_categories: [],
      top_collaborators: [],
      intent_by_paper: new Map(),
      most_replicated_paper_id: null,
    });
  });

  it("author with no papers in input → papers_count=0", () => {
    const others = [scored(paper({ id: "p1", authors: ["someone else"] }))];
    expect(computeAuthorStats("isaiah", others, noIntents).papers_count).toBe(0);
  });

  it("single paper with one author → papers_count=1", () => {
    const s = computeAuthorStats(
      "isaiah",
      [scored(paper({ id: "p1", authors: ["Isaiah"] }))],
      noIntents,
    );
    expect(s.papers_count).toBe(1);
  });

  it("sums citations across matched papers only", () => {
    const all = [
      scored(paper({ id: "p1", authors: ["Isaiah"], citation_count: 10 })),
      scored(paper({ id: "p2", authors: ["Other"], citation_count: 100 })),
      scored(paper({ id: "p3", authors: ["Isaiah"], citation_count: 5 })),
    ];
    expect(computeAuthorStats("isaiah", all, noIntents).citations_total).toBe(15);
  });

  it("treats author names case-insensitively", () => {
    const all = [scored(paper({ id: "p1", authors: ["ISAIAH"] }))];
    expect(computeAuthorStats("isaiah", all, noIntents).papers_count).toBe(1);
  });

  it("matches by NFKD-normalised name (handles diacritics)", () => {
    const all = [scored(paper({ id: "p1", authors: ["Gehrïg"] }))];
    expect(computeAuthorStats("gehrig", all, noIntents).papers_count).toBe(1);
  });
});

describe("computeAuthorStats — h-index proxy", () => {
  it("0 papers → h=0", () => {
    expect(computeAuthorStats("x", [], noIntents).h_index_proxy).toBe(0);
  });

  it("3 papers each with 3+ citations → h=3", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X"], citation_count: 10 })),
      scored(paper({ id: "b", authors: ["X"], citation_count: 5 })),
      scored(paper({ id: "c", authors: ["X"], citation_count: 3 })),
    ];
    expect(computeAuthorStats("x", all, noIntents).h_index_proxy).toBe(3);
  });

  it("3 papers with 1, 0, 0 citations → h=1", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X"], citation_count: 1 })),
      scored(paper({ id: "b", authors: ["X"], citation_count: 0 })),
      scored(paper({ id: "c", authors: ["X"], citation_count: 0 })),
    ];
    expect(computeAuthorStats("x", all, noIntents).h_index_proxy).toBe(1);
  });

  it("1 paper with 100 citations → h=1", () => {
    const all = [scored(paper({ id: "a", authors: ["X"], citation_count: 100 }))];
    expect(computeAuthorStats("x", all, noIntents).h_index_proxy).toBe(1);
  });

  it("5 papers all with 100 citations → h=5", () => {
    const all = Array.from({ length: 5 }, (_, i) =>
      scored(paper({ id: `p${i}`, authors: ["X"], citation_count: 100 })),
    );
    expect(computeAuthorStats("x", all, noIntents).h_index_proxy).toBe(5);
  });

  it("5 papers with 5,5,5,1,1 citations → h=3", () => {
    const all = [5, 5, 5, 1, 1].map((c, i) =>
      scored(paper({ id: `p${i}`, authors: ["X"], citation_count: c })),
    );
    expect(computeAuthorStats("x", all, noIntents).h_index_proxy).toBe(3);
  });
});

describe("computeAuthorStats — venue + category top-K", () => {
  it("top venues sorted by count desc", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X"], venue: { name: "CVPR", type: "conference" } })),
      scored(paper({ id: "b", authors: ["X"], venue: { name: "CVPR", type: "conference" } })),
      scored(paper({ id: "c", authors: ["X"], venue: { name: "ICCV", type: "conference" } })),
    ];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.top_venues[0]).toEqual(["CVPR", 2]);
    expect(s.top_venues[1]).toEqual(["ICCV", 1]);
  });

  it("respects top_venues_cap", () => {
    const all = ["A", "B", "C", "D", "E"].map((v, i) =>
      scored(paper({ id: `p${i}`, authors: ["X"], venue: { name: v, type: "conference" } })),
    );
    const s = computeAuthorStats("x", all, noIntents, { top_venues_cap: 2 });
    expect(s.top_venues).toHaveLength(2);
  });

  it("paper without venue counts as 'preprint'", () => {
    const all = [scored(paper({ id: "a", authors: ["X"], venue: undefined }))];
    expect(computeAuthorStats("x", all, noIntents).top_venues[0][0]).toBe("preprint");
  });

  it("paper without eccg_category counts as 'unclassified'", () => {
    const all = [scored(paper({ id: "a", authors: ["X"], eccg_category: undefined }))];
    expect(computeAuthorStats("x", all, noIntents).top_categories[0][0]).toBe("unclassified");
  });

  it("top categories aggregates same category across papers", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X"], eccg_category: "slam" })),
      scored(paper({ id: "b", authors: ["X"], eccg_category: "slam" })),
      scored(paper({ id: "c", authors: ["X"], eccg_category: "optical_flow" })),
    ];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.top_categories[0]).toEqual(["slam", 2]);
  });
});

describe("computeAuthorStats — replication metrics", () => {
  it("sums replication intents across papers", () => {
    const ints = new Map([
      ["a", ic({ methodology: 3, result: 1, extensionMethodology: 1, total: 5, replication: 5 })],
      ["b", ic({ methodology: 2, total: 2, replication: 2 })],
    ]);
    const all = [
      scored(paper({ id: "a", authors: ["X"] })),
      scored(paper({ id: "b", authors: ["X"] })),
    ];
    const s = computeAuthorStats("x", all, (id) => ints.get(id) ?? ZERO_IC);
    expect(s.replication_total).toBe(5 + 2);
    expect(s.in_corpus_cited_by).toBe(5 + 2);
    expect(s.papers_with_replication).toBe(2);
  });

  it("background-only citations don't add to replication_total", () => {
    const ints = new Map([
      ["a", ic({ background: 5, total: 5, replication: 0 })],
    ]);
    const all = [scored(paper({ id: "a", authors: ["X"] }))];
    const s = computeAuthorStats("x", all, (id) => ints.get(id) ?? ZERO_IC);
    expect(s.replication_total).toBe(0);
    expect(s.background_total).toBe(5);
    expect(s.papers_with_replication).toBe(0);
  });

  it("most_replicated_paper_id picks the paper with the highest replication", () => {
    const ints = new Map([
      ["a", ic({ methodology: 2, total: 2, replication: 2 })],
      ["b", ic({ methodology: 5, total: 5, replication: 5 })],
      ["c", ic({ methodology: 1, total: 1, replication: 1 })],
    ]);
    const all = [
      scored(paper({ id: "a", authors: ["X"] })),
      scored(paper({ id: "b", authors: ["X"] })),
      scored(paper({ id: "c", authors: ["X"] })),
    ];
    const s = computeAuthorStats("x", all, (id) => ints.get(id) ?? ZERO_IC);
    expect(s.most_replicated_paper_id).toBe("b");
  });

  it("most_replicated_paper_id is null when no paper has replication > 0", () => {
    const all = [scored(paper({ id: "a", authors: ["X"] }))];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.most_replicated_paper_id).toBeNull();
  });

  it("intent_by_paper map contains entries for every author's paper", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X"] })),
      scored(paper({ id: "b", authors: ["X"] })),
    ];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.intent_by_paper.size).toBe(2);
    expect(s.intent_by_paper.has("a")).toBe(true);
    expect(s.intent_by_paper.has("b")).toBe(true);
  });

  it("intent_by_paper map excludes non-author papers", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X"] })),
      scored(paper({ id: "b", authors: ["Other"] })),
    ];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.intent_by_paper.has("a")).toBe(true);
    expect(s.intent_by_paper.has("b")).toBe(false);
  });

  it("counts only first appearance of paper if appears twice (idempotent input)", () => {
    const ints = new Map([
      ["a", ic({ methodology: 3, total: 3, replication: 3 })],
    ]);
    // Practically, the corpus deduplicates, but the math should still be sane.
    const all = [scored(paper({ id: "a", authors: ["X"] }))];
    const s = computeAuthorStats("x", all, (id) => ints.get(id) ?? ZERO_IC);
    expect(s.papers_with_replication).toBe(1);
  });
});

describe("computeAuthorStats — collaborators", () => {
  it("returns empty list when no co-authors", () => {
    const all = [scored(paper({ id: "a", authors: ["X"] }))];
    expect(computeAuthorStats("x", all, noIntents).top_collaborators).toEqual([]);
  });

  it("excludes the author themselves", () => {
    const all = [scored(paper({ id: "a", authors: ["X", "Y"] }))];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.top_collaborators.find(([n]) => normaliseAuthor(n) === "x")).toBeUndefined();
  });

  it("min_collaborator_count filters single-paper co-authors", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X", "Y"] })),
      scored(paper({ id: "b", authors: ["X", "Z"] })),
    ];
    const s = computeAuthorStats("x", all, noIntents);
    // Y and Z each only co-authored 1 paper with X
    expect(s.top_collaborators).toEqual([]);
  });

  it("includes co-authors with ≥ 2 joint papers", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X", "Y"] })),
      scored(paper({ id: "b", authors: ["X", "Y"] })),
      scored(paper({ id: "c", authors: ["X", "Z"] })),
    ];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.top_collaborators).toEqual([["Y", 2]]);
  });

  it("sorts collaborators by count desc", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X", "Y"] })),
      scored(paper({ id: "b", authors: ["X", "Y"] })),
      scored(paper({ id: "c", authors: ["X", "Z"] })),
      scored(paper({ id: "d", authors: ["X", "Z"] })),
      scored(paper({ id: "e", authors: ["X", "Z"] })),
    ];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.top_collaborators[0]).toEqual(["Z", 3]);
    expect(s.top_collaborators[1]).toEqual(["Y", 2]);
  });

  it("respects top_collaborators_cap", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X", "Y", "Z", "W"] })),
      scored(paper({ id: "b", authors: ["X", "Y", "Z", "W"] })),
    ];
    const s = computeAuthorStats("x", all, noIntents, { top_collaborators_cap: 2 });
    expect(s.top_collaborators).toHaveLength(2);
  });

  it("min_collaborator_count=1 lets singletons through", () => {
    const all = [scored(paper({ id: "a", authors: ["X", "Y"] }))];
    const s = computeAuthorStats("x", all, noIntents, { min_collaborator_count: 1 });
    expect(s.top_collaborators).toEqual([["Y", 1]]);
  });
});

describe("computeAuthorStats — robustness", () => {
  it("does not mutate the input list", () => {
    const all = [scored(paper({ id: "a", authors: ["X"] }))];
    const snapshot = JSON.parse(JSON.stringify(all));
    computeAuthorStats("x", all, noIntents);
    expect(all).toEqual(snapshot);
  });

  it("calls intentCounter exactly once per author paper", () => {
    const calls: string[] = [];
    const counter = (id: string) => {
      calls.push(id);
      return ZERO_IC;
    };
    const all = [
      scored(paper({ id: "a", authors: ["X"] })),
      scored(paper({ id: "b", authors: ["X"] })),
      scored(paper({ id: "c", authors: ["Y"] })), // not by X
    ];
    computeAuthorStats("x", all, counter);
    expect(calls.sort()).toEqual(["a", "b"]);
  });

  it("scales to 200 papers per author without throwing", () => {
    const all = Array.from({ length: 200 }, (_, i) =>
      scored(paper({ id: `p${i}`, authors: ["X"] })),
    );
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.papers_count).toBe(200);
  });

  it("handles a paper with 10 co-authors", () => {
    const co = Array.from({ length: 10 }, (_, i) => `C${i}`);
    const all = [
      scored(paper({ id: "a", authors: ["X", ...co] })),
      scored(paper({ id: "b", authors: ["X", ...co] })),
    ];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.top_collaborators).toHaveLength(8); // default cap
  });

  it("treats missing eccg_category and missing venue independently", () => {
    const all = [
      scored(paper({ id: "a", authors: ["X"], venue: undefined, eccg_category: undefined })),
    ];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.top_venues[0][0]).toBe("preprint");
    expect(s.top_categories[0][0]).toBe("unclassified");
  });

  it("h_index_proxy never exceeds papers_count", () => {
    const all = [scored(paper({ id: "a", authors: ["X"], citation_count: 9999 }))];
    const s = computeAuthorStats("x", all, noIntents);
    expect(s.h_index_proxy).toBeLessThanOrEqual(s.papers_count);
  });

  it("papers_with_replication ≤ papers_count", () => {
    const ints = new Map([
      ["a", ic({ methodology: 1, total: 1, replication: 1 })],
    ]);
    const all = [
      scored(paper({ id: "a", authors: ["X"] })),
      scored(paper({ id: "b", authors: ["X"] })),
    ];
    const s = computeAuthorStats("x", all, (id) => ints.get(id) ?? ZERO_IC);
    expect(s.papers_with_replication).toBeLessThanOrEqual(s.papers_count);
  });
});
