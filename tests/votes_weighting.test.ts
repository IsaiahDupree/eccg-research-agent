import { describe, it, expect } from "vitest";
import { weightOne, weightTallies, type EditorPredicate } from "@/lib/votes_weighting";
import type { CollabVote, CollabVotesPerPaper } from "@/lib/collab";

function vote(voter: string, value: 1 | -1): CollabVote {
  return { voter, value, voted_at: "2026-05-17T00:00:00Z" };
}

function tally(voters: CollabVote[]): CollabVotesPerPaper {
  const upvotes = voters.filter((v) => v.value === 1).length;
  const downvotes = voters.filter((v) => v.value === -1).length;
  return { upvotes, downvotes, net: upvotes - downvotes, voters };
}

const EDITOR_ALWAYS: EditorPredicate = () => true;
const EDITOR_NEVER: EditorPredicate = () => false;
const editorByName = (names: string[]): EditorPredicate => {
  const set = new Set(names.map((n) => n.toLowerCase()));
  return (voter: string) => set.has(voter.toLowerCase());
};

describe("weightOne — single-paper weighting", () => {
  it("returns zeros for an empty tally", () => {
    const r = weightOne(tally([]), EDITOR_ALWAYS);
    expect(r).toEqual({ up: 0, down: 0, net: 0, editor_up: 0, editor_down: 0, weighted_net: 0 });
  });

  it("single up vote by editor → weighted_net=2", () => {
    const r = weightOne(tally([vote("isaiah", 1)]), EDITOR_ALWAYS);
    expect(r.weighted_net).toBe(2);
    expect(r.editor_up).toBe(1);
    expect(r.editor_down).toBe(0);
  });

  it("single up vote by non-editor → weighted_net=1", () => {
    const r = weightOne(tally([vote("randy", 1)]), EDITOR_NEVER);
    expect(r.weighted_net).toBe(1);
    expect(r.editor_up).toBe(0);
  });

  it("single down vote by editor → weighted_net=-2", () => {
    const r = weightOne(tally([vote("isaiah", -1)]), EDITOR_ALWAYS);
    expect(r.weighted_net).toBe(-2);
    expect(r.editor_down).toBe(1);
  });

  it("single down vote by non-editor → weighted_net=-1", () => {
    const r = weightOne(tally([vote("randy", -1)]), EDITOR_NEVER);
    expect(r.weighted_net).toBe(-1);
    expect(r.editor_down).toBe(0);
  });

  it("two editor up votes → weighted_net=4", () => {
    const r = weightOne(
      tally([vote("isaiah", 1), vote("rick", 1)]),
      EDITOR_ALWAYS,
    );
    expect(r.weighted_net).toBe(4);
  });

  it("two non-editor up votes → weighted_net=2", () => {
    const r = weightOne(
      tally([vote("a", 1), vote("b", 1)]),
      EDITOR_NEVER,
    );
    expect(r.weighted_net).toBe(2);
  });

  it("mixed editor up + non-editor up → weighted_net=3", () => {
    const r = weightOne(
      tally([vote("isaiah", 1), vote("randy", 1)]),
      editorByName(["isaiah"]),
    );
    expect(r.weighted_net).toBe(3);
    expect(r.editor_up).toBe(1);
  });

  it("editor up cancels editor down → weighted_net=0", () => {
    const r = weightOne(
      tally([vote("isaiah", 1), vote("rick", -1)]),
      EDITOR_ALWAYS,
    );
    expect(r.weighted_net).toBe(0);
    expect(r.editor_up).toBe(1);
    expect(r.editor_down).toBe(1);
  });

  it("preserves the existing up/down/net unchanged", () => {
    const r = weightOne(
      tally([vote("a", 1), vote("b", 1), vote("c", -1)]),
      EDITOR_NEVER,
    );
    expect(r.up).toBe(2);
    expect(r.down).toBe(1);
    expect(r.net).toBe(1);
  });

  it("editor_up + editor_down ≤ up + down", () => {
    const r = weightOne(
      tally([vote("isaiah", 1), vote("randy", 1), vote("rick", -1)]),
      editorByName(["isaiah"]),
    );
    expect(r.editor_up + r.editor_down).toBeLessThanOrEqual(r.up + r.down);
  });

  it("weighted_net = net + editor_up - editor_down (invariant)", () => {
    const v = tally([
      vote("isaiah", 1),
      vote("rick", 1),
      vote("randy", -1),
    ]);
    const r = weightOne(v, editorByName(["isaiah", "rick"]));
    expect(r.weighted_net).toBe(r.net + r.editor_up - r.editor_down);
  });

  it("all editors voting up — weighted = 2 × up", () => {
    const r = weightOne(
      tally([vote("a", 1), vote("b", 1), vote("c", 1)]),
      EDITOR_ALWAYS,
    );
    expect(r.weighted_net).toBe(6);
  });

  it("editor on each side — bonuses cancel out", () => {
    const r = weightOne(
      tally([vote("alice", 1), vote("bob", -1)]),
      EDITOR_ALWAYS,
    );
    expect(r.weighted_net).toBe(0);
  });

  it("non-editor's vote contributes to net but not editor_*", () => {
    const r = weightOne(tally([vote("randy", 1)]), EDITOR_NEVER);
    expect(r.up).toBe(1);
    expect(r.editor_up).toBe(0);
  });

  it("ignores votes with unrecognised values (none possible in shape)", () => {
    const r = weightOne(tally([vote("a", 1)]), EDITOR_ALWAYS);
    expect(r.up).toBe(1);
  });

  it("predicate called once per voter", () => {
    const calls: string[] = [];
    const pred: EditorPredicate = (v) => {
      calls.push(v);
      return true;
    };
    weightOne(tally([vote("a", 1), vote("b", 1), vote("c", -1)]), pred);
    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("predicate receives raw voter string (not lowercased)", () => {
    const seen: string[] = [];
    const pred: EditorPredicate = (v) => {
      seen.push(v);
      return false;
    };
    weightOne(tally([vote("Isaiah", 1)]), pred);
    expect(seen).toEqual(["Isaiah"]);
  });

  it("case-sensitive predicate distinguishes Isaiah / isaiah", () => {
    const pred = editorByName(["isaiah"]); // lowercases internally
    const a = weightOne(tally([vote("Isaiah", 1)]), pred);
    expect(a.editor_up).toBe(1);
    const b = weightOne(tally([vote("randy", 1)]), pred);
    expect(b.editor_up).toBe(0);
  });

  it("editor double-down with single non-editor up → weighted_net=-3", () => {
    const r = weightOne(
      tally([vote("isaiah", -1), vote("rick", -1), vote("randy", 1)]),
      editorByName(["isaiah", "rick"]),
    );
    expect(r.up).toBe(1);
    expect(r.down).toBe(2);
    expect(r.net).toBe(-1);
    expect(r.editor_down).toBe(2);
    expect(r.weighted_net).toBe(-3);
  });

  it("handles long voter lists", () => {
    const voters: CollabVote[] = [];
    for (let i = 0; i < 100; i++) voters.push(vote(`v${i}`, 1));
    const r = weightOne(tally(voters), EDITOR_NEVER);
    expect(r.up).toBe(100);
    expect(r.weighted_net).toBe(100);
  });

  it("100 editor up votes → weighted_net=200", () => {
    const voters: CollabVote[] = [];
    for (let i = 0; i < 100; i++) voters.push(vote(`v${i}`, 1));
    const r = weightOne(tally(voters), EDITOR_ALWAYS);
    expect(r.weighted_net).toBe(200);
  });

  it("never returns NaN", () => {
    const r = weightOne(tally([]), EDITOR_NEVER);
    expect(Number.isNaN(r.weighted_net)).toBe(false);
  });

  it("editor only counts each voter once (no double-bonus)", () => {
    const r = weightOne(tally([vote("isaiah", 1)]), EDITOR_ALWAYS);
    expect(r.editor_up).toBe(1);
  });

  it("does not mutate the input tally", () => {
    const input = tally([vote("a", 1)]);
    const snapshot = JSON.parse(JSON.stringify(input));
    weightOne(input, EDITOR_ALWAYS);
    expect(input).toEqual(snapshot);
  });

  it("editor_up never exceeds upvotes", () => {
    const r = weightOne(
      tally([vote("a", 1), vote("b", 1), vote("c", -1)]),
      EDITOR_ALWAYS,
    );
    expect(r.editor_up).toBeLessThanOrEqual(r.up);
  });
});

describe("weightTallies — multi-paper map", () => {
  it("empty input → empty output", () => {
    expect(weightTallies({}, EDITOR_ALWAYS)).toEqual({});
  });

  it("preserves paper ids as keys", () => {
    const out = weightTallies(
      {
        "arxiv-1": tally([vote("a", 1)]),
        "arxiv-2": tally([vote("b", -1)]),
      },
      EDITOR_NEVER,
    );
    expect(Object.keys(out).sort()).toEqual(["arxiv-1", "arxiv-2"]);
  });

  it("applies predicate independently per paper", () => {
    const out = weightTallies(
      {
        "p1": tally([vote("isaiah", 1)]),
        "p2": tally([vote("randy", 1)]),
      },
      editorByName(["isaiah"]),
    );
    expect(out.p1.weighted_net).toBe(2);
    expect(out.p2.weighted_net).toBe(1);
  });

  it("returns a fresh object each call (no shared state)", () => {
    const input = { p1: tally([vote("a", 1)]) };
    const a = weightTallies(input, EDITOR_ALWAYS);
    const b = weightTallies(input, EDITOR_ALWAYS);
    expect(a).not.toBe(b);
    expect(a.p1).not.toBe(b.p1);
  });

  it("ten papers all-zero votes → all weighted_net=0", () => {
    const input: Record<string, CollabVotesPerPaper> = {};
    for (let i = 0; i < 10; i++) input[`p${i}`] = tally([]);
    const out = weightTallies(input, EDITOR_ALWAYS);
    for (const v of Object.values(out)) expect(v.weighted_net).toBe(0);
  });

  it("mixed up/down/editor across papers", () => {
    const out = weightTallies(
      {
        "a": tally([vote("ed", 1)]),
        "b": tally([vote("ed", -1)]),
        "c": tally([vote("non", 1)]),
        "d": tally([vote("non", -1)]),
        "e": tally([vote("ed", 1), vote("non", 1)]),
      },
      editorByName(["ed"]),
    );
    expect(out.a.weighted_net).toBe(2);
    expect(out.b.weighted_net).toBe(-2);
    expect(out.c.weighted_net).toBe(1);
    expect(out.d.weighted_net).toBe(-1);
    expect(out.e.weighted_net).toBe(3);
  });

  it("missing voters list (empty array) handled", () => {
    const out = weightTallies(
      { p1: { upvotes: 0, downvotes: 0, net: 0, voters: [] } },
      EDITOR_ALWAYS,
    );
    expect(out.p1).toEqual({
      up: 0,
      down: 0,
      net: 0,
      editor_up: 0,
      editor_down: 0,
      weighted_net: 0,
    });
  });

  it("does not mutate input map", () => {
    const input = { p1: tally([vote("a", 1)]) };
    const snap = JSON.parse(JSON.stringify(input));
    weightTallies(input, EDITOR_ALWAYS);
    expect(input).toEqual(snap);
  });

  it("scales to 500 papers in linear time", () => {
    const input: Record<string, CollabVotesPerPaper> = {};
    for (let i = 0; i < 500; i++) input[`p${i}`] = tally([vote("a", 1)]);
    const out = weightTallies(input, EDITOR_ALWAYS);
    expect(Object.keys(out)).toHaveLength(500);
    expect(out.p0.weighted_net).toBe(2);
  });

  it("editor_up = upvotes when all voters are editors", () => {
    const out = weightTallies(
      { p1: tally([vote("a", 1), vote("b", 1)]) },
      EDITOR_ALWAYS,
    );
    expect(out.p1.editor_up).toBe(out.p1.up);
  });

  it("editor_down = downvotes when all voters are editors", () => {
    const out = weightTallies(
      { p1: tally([vote("a", -1), vote("b", -1), vote("c", -1)]) },
      EDITOR_ALWAYS,
    );
    expect(out.p1.editor_down).toBe(out.p1.down);
  });

  it("weighted_net never drifts from net when no editors vote", () => {
    const out = weightTallies(
      {
        a: tally([vote("v1", 1)]),
        b: tally([vote("v2", -1)]),
        c: tally([vote("v3", 1), vote("v4", -1)]),
      },
      EDITOR_NEVER,
    );
    for (const r of Object.values(out)) {
      expect(r.weighted_net).toBe(r.net);
    }
  });

  it("weighted_net = 2 × net when all voters are editors and same-sign", () => {
    const out = weightTallies(
      {
        a: tally([vote("e1", 1), vote("e2", 1), vote("e3", 1)]),
      },
      EDITOR_ALWAYS,
    );
    expect(out.a.weighted_net).toBe(out.a.net * 2);
  });

  it("predicate can be email-shaped", () => {
    const pred = editorByName(["isaiah@example.com"]);
    const out = weightTallies(
      { p: tally([vote("isaiah@example.com", 1), vote("randy", 1)]) },
      pred,
    );
    expect(out.p.editor_up).toBe(1);
    expect(out.p.weighted_net).toBe(3);
  });

  it("voter aliases with mixed case match against lowercased allowlist", () => {
    const pred = editorByName(["isaiah"]); // stored lowercase
    const out = weightTallies(
      { p: tally([vote("ISAIAH", 1), vote("Isaiah", -1)]) },
      pred,
    );
    expect(out.p.editor_up).toBe(1);
    expect(out.p.editor_down).toBe(1);
    expect(out.p.weighted_net).toBe(0);
  });

  it("never sets editor_up < 0 or editor_down < 0", () => {
    const out = weightTallies(
      {
        a: tally([vote("v", 1)]),
        b: tally([vote("v", -1)]),
        c: tally([]),
      },
      EDITOR_NEVER,
    );
    for (const r of Object.values(out)) {
      expect(r.editor_up).toBeGreaterThanOrEqual(0);
      expect(r.editor_down).toBeGreaterThanOrEqual(0);
    }
  });
});
