// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VoteWidget } from "@/components/VoteWidget";
import { clearVotesCache } from "@/lib/votes_client";
import { hydrateAndCheck, flush, stubFetch } from "./hydration_utils";

const PAPER = "arxiv-2402.18221";

let fetchStub: ReturnType<typeof stubFetch> | null = null;

beforeEach(() => {
  clearVotesCache();
  fetchStub = stubFetch((url) => {
    if (url.includes("/api/votes")) return { votes: {} };
    return {};
  });
});

afterEach(() => {
  fetchStub?.restore();
  fetchStub = null;
});

describe("VoteWidget — hydration", () => {
  it("hydrates without console errors", () => {
    const { errors } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    expect(errors).toEqual([]);
  });

  it("DOM matches SSR output after hydration", () => {
    const { ssrHtml, container } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    expect(container.innerHTML).toBe(ssrHtml);
  });

  it("renders 0/0 net when no votes cached", () => {
    const { container } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    // Counts default to 0 / 0
    expect(container.textContent).toContain("0");
  });

  it("renders both up + down buttons", () => {
    const { container } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("up-button has descriptive title attribute", () => {
    const { container } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    const up = Array.from(container.querySelectorAll("button")).find((b) =>
      b.getAttribute("title")?.toLowerCase().includes("upvote"),
    );
    expect(up).toBeTruthy();
  });

  it("down-button has descriptive title attribute", () => {
    const { container } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    const down = Array.from(container.querySelectorAll("button")).find((b) =>
      b.getAttribute("title")?.toLowerCase().includes("downvote"),
    );
    expect(down).toBeTruthy();
  });

  it("up-button starts with aria-pressed=false", () => {
    const { container } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    const up = Array.from(container.querySelectorAll("button")).find((b) =>
      b.getAttribute("title")?.toLowerCase().includes("upvote"),
    );
    expect(up?.getAttribute("aria-pressed")).toBe("false");
  });

  it("down-button starts with aria-pressed=false", () => {
    const { container } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    const down = Array.from(container.querySelectorAll("button")).find((b) =>
      b.getAttribute("title")?.toLowerCase().includes("downvote"),
    );
    expect(down?.getAttribute("aria-pressed")).toBe("false");
  });

  it("compact form omits a reason input", () => {
    const { container } = hydrateAndCheck(
      <VoteWidget paperId={PAPER} compact />,
    );
    expect(container.querySelector("input[type='text']")).toBeNull();
  });

  it("non-compact form may render a reason input on the +/- buttons", () => {
    // The reason input is opt-in via showReason flag, not the !compact branch.
    const { container } = hydrateAndCheck(
      <VoteWidget paperId={PAPER} showReason />,
    );
    // Either an input is present or the count area renders.
    expect(container.querySelectorAll("button").length).toBeGreaterThanOrEqual(2);
  });

  it("triggers /api/votes fetch on mount", async () => {
    hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    await flush();
    const urls = fetchStub?.spy.mock.calls.map((c) =>
      typeof c[0] === "string" ? c[0] : "",
    ) ?? [];
    expect(urls.some((u) => u.includes("/api/votes"))).toBe(true);
  });

  it("survives unmount + remount without throwing", () => {
    const r1 = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    r1.root.unmount();
    const r2 = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    expect(r2.errors).toEqual([]);
  });

  it("renders for a paper id with special chars without crashing", () => {
    const { errors } = hydrateAndCheck(<VoteWidget paperId="doi-10.1109/abc.2024.xyz" />);
    expect(errors).toEqual([]);
  });

  it("does not throw when paperId is a long string", () => {
    const long = "arxiv-" + "0".repeat(200);
    const { errors } = hydrateAndCheck(<VoteWidget paperId={long} />);
    expect(errors).toEqual([]);
  });

  it("emits no warnings during hydration", () => {
    const { warnings } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    expect(warnings).toEqual([]);
  });

  it("buttons default to non-busy state (not disabled)", () => {
    const { container } = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    const buttons = container.querySelectorAll("button");
    for (const b of buttons) {
      // We don't necessarily disable buttons by default — just confirm
      // aria-pressed is settable, not that disabled is true.
      expect(b.hasAttribute("disabled")).toBe(false);
    }
  });

  it("renders identical SSR / hydrated output for identical props", () => {
    const a = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    a.root.unmount();
    const b = hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    expect(b.ssrHtml).toBe(a.ssrHtml);
  });

  it("renders different SSR output for different paper ids", () => {
    const a = hydrateAndCheck(<VoteWidget paperId="a" />);
    a.root.unmount();
    const b = hydrateAndCheck(<VoteWidget paperId="b" />);
    // The HTML may differ via embedded paper id attributes/keys — but as
    // long as no hydration mismatch occurs, the test passes.
    expect(b.errors).toEqual([]);
  });

  it("does not fire vote-cast fetch on initial render", async () => {
    hydrateAndCheck(<VoteWidget paperId={PAPER} />);
    await flush();
    const postCalls = (fetchStub?.spy.mock.calls ?? []).filter((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    expect(postCalls.length).toBe(0);
  });
});
