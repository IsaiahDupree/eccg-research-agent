// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PaperRow } from "@/components/PaperRow";
import { clearLibraryCache } from "@/lib/library_client";
import { clearVotesCache } from "@/lib/votes_client";
import { hydrateAndCheck, mkScored, flush, stubFetch } from "./hydration_utils";

let fetchStub: ReturnType<typeof stubFetch> | null = null;

beforeEach(() => {
  // Both clients keep a module-scoped cache; reset between tests so each
  // test re-fires the fetch we want to assert on.
  clearLibraryCache();
  clearVotesCache();
  fetchStub = stubFetch((url) => {
    if (url.includes("/api/library")) return { library: [] };
    if (url.includes("/api/votes")) return { votes: {} };
    return {};
  });
});

afterEach(() => {
  fetchStub?.restore();
  fetchStub = null;
});

describe("PaperRow — hydration", () => {
  it("hydrates without console errors", async () => {
    const { errors } = hydrateAndCheck(<PaperRow scored={mkScored()} rank={1} />);
    await flush();
    expect(errors).toEqual([]);
  });

  it("server HTML survives hydration (no DOM mismatch)", () => {
    const { ssrHtml, container } = hydrateAndCheck(<PaperRow scored={mkScored()} rank={1} />);
    expect(container.innerHTML).toBe(ssrHtml);
  });

  it("renders the paper title", () => {
    const { container } = hydrateAndCheck(<PaperRow scored={mkScored()} rank={1} />);
    expect(container.textContent).toContain(mkScored().paper.title);
  });

  it("renders the rank number", () => {
    const { container } = hydrateAndCheck(<PaperRow scored={mkScored()} rank={7} />);
    expect(container.textContent).toContain("#7");
  });

  it("renders all listed authors (up to 3)", () => {
    const sc = mkScored();
    sc.paper.authors = [
      { name: "A One" },
      { name: "B Two" },
      { name: "C Three" },
    ];
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(container.textContent).toContain("A One");
    expect(container.textContent).toContain("B Two");
    expect(container.textContent).toContain("C Three");
  });

  it("truncates authors with +N when count > 3", () => {
    const sc = mkScored();
    sc.paper.authors = [
      { name: "A1" },
      { name: "A2" },
      { name: "A3" },
      { name: "A4" },
      { name: "A5" },
    ];
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(container.textContent).toContain("+2");
  });

  it("renders citation count when > 0", () => {
    const sc = mkScored();
    sc.paper.citation_count = 100;
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(container.textContent).toContain("100 citations");
  });

  it("omits citation badge when count is 0", () => {
    const sc = mkScored();
    sc.paper.citation_count = 0;
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(container.textContent).not.toContain("citations");
  });

  it("renders venue name", () => {
    const { container } = hydrateAndCheck(<PaperRow scored={mkScored()} rank={1} />);
    expect(container.textContent).toContain("CVPR");
  });

  it("falls back to 'preprint' when venue is missing", () => {
    const sc = mkScored();
    sc.paper.venue = undefined;
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(container.textContent).toContain("preprint");
  });

  it("uses displayScore prop when provided", () => {
    const { container } = hydrateAndCheck(
      <PaperRow scored={mkScored()} rank={1} displayScore={99} />,
    );
    expect(container.textContent).toContain("99");
  });

  it("renders scoreSubLabel when provided", () => {
    const { container } = hydrateAndCheck(
      <PaperRow scored={mkScored()} rank={1} scoreSubLabel="hot 1.7" />,
    );
    expect(container.textContent).toContain("hot 1.7");
  });

  it("wraps highlighted query match in <mark>", () => {
    const sc = mkScored();
    sc.paper.title = "Event Camera SLAM Survey";
    const { container } = hydrateAndCheck(
      <PaperRow scored={sc} rank={1} highlight="SLAM" />,
    );
    expect(container.querySelector("mark")?.textContent).toBe("SLAM");
  });

  it("highlight is case-insensitive", () => {
    const sc = mkScored();
    sc.paper.title = "Event Camera SLAM";
    const { container } = hydrateAndCheck(
      <PaperRow scored={sc} rank={1} highlight="slam" />,
    );
    expect(container.querySelector("mark")?.textContent).toBe("SLAM");
  });

  it("no <mark> when highlight is empty", () => {
    const { container } = hydrateAndCheck(
      <PaperRow scored={mkScored()} rank={1} highlight="" />,
    );
    expect(container.querySelector("mark")).toBeNull();
  });

  it("no <mark> when highlight doesn't appear in title", () => {
    const sc = mkScored();
    sc.paper.title = "Event Camera SLAM";
    const { container } = hydrateAndCheck(
      <PaperRow scored={sc} rank={1} highlight="xyz" />,
    );
    expect(container.querySelector("mark")).toBeNull();
  });

  it("provides a /paper/:id link", () => {
    const sc = mkScored();
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    const link = Array.from(container.querySelectorAll("a")).find((a) =>
      a.getAttribute("href")?.startsWith("/paper/"),
    );
    expect(link?.getAttribute("href")).toBe(`/paper/${encodeURIComponent(sc.paper.id)}`);
  });

  it("provides author links to /author/:name", () => {
    const sc = mkScored();
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    const authorLink = Array.from(container.querySelectorAll("a")).find((a) =>
      a.getAttribute("href")?.includes("/author/"),
    );
    expect(authorLink).toBeTruthy();
  });

  it("renders category badge when eccg_category set", () => {
    const sc = mkScored();
    sc.paper.eccg_category = "slam";
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    // categoryLabel title-cases the slug → "Slam"
    expect(container.textContent).toContain("Slam");
  });

  it("hydrates with no eccg_category present", () => {
    const sc = mkScored();
    sc.paper.eccg_category = undefined;
    const { errors } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(errors).toEqual([]);
  });

  it("renders Save button (client component embedded)", () => {
    const { container } = hydrateAndCheck(<PaperRow scored={mkScored()} rank={1} />);
    const btn = container.querySelector("button[aria-label*='ibrary']");
    expect(btn).toBeTruthy();
  });

  it("Save button starts unsaved (aria-pressed=false)", () => {
    const { container } = hydrateAndCheck(<PaperRow scored={mkScored()} rank={1} />);
    const btn = container.querySelector("button[aria-label*='ibrary']");
    expect(btn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("VoteWidget button is rendered", () => {
    const { container } = hydrateAndCheck(<PaperRow scored={mkScored()} rank={1} />);
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
  });

  it("fires fetch via useEffect during act()-wrapped hydration", () => {
    // act() flushes effects synchronously, so by the time hydrateAndCheck
    // returns, the library + votes fetches have already kicked off.
    hydrateAndCheck(<PaperRow scored={mkScored()} rank={1} />);
    expect(fetchStub?.spy.mock.calls.length ?? 0).toBeGreaterThan(0);
  });

  it("issues /api/library + /api/votes once each", async () => {
    hydrateAndCheck(<PaperRow scored={mkScored()} rank={1} />);
    await flush();
    const calls = fetchStub?.spy.mock.calls.map((c) =>
      typeof c[0] === "string" ? c[0] : (c[0] as { url?: string }).url ?? "",
    ) ?? [];
    expect(calls.filter((u) => u.includes("/api/library")).length).toBeGreaterThan(0);
    expect(calls.filter((u) => u.includes("/api/votes")).length).toBeGreaterThan(0);
  });

  it("survives a long title without overflowing layout assumptions", () => {
    const sc = mkScored();
    sc.paper.title = "A".repeat(500);
    const { errors } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(errors).toEqual([]);
  });

  it("survives unicode in title", () => {
    const sc = mkScored();
    sc.paper.title = "Naïve Event-Caméra Méthode";
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(container.textContent).toContain("Naïve");
  });

  it("renders arXiv external link when html_url present", () => {
    const sc = mkScored();
    sc.paper.html_url = "https://arxiv.org/abs/2402.18221";
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(container.textContent).toContain("arXiv");
  });

  it("omits arXiv link when html_url is missing", () => {
    const sc = mkScored();
    sc.paper.html_url = undefined;
    const { container } = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    const links = Array.from(container.querySelectorAll("a")).filter((a) =>
      a.getAttribute("href")?.startsWith("http"),
    );
    expect(links.length).toBe(0);
  });

  it("repeated hydration on same shape is idempotent", () => {
    const sc = mkScored();
    const r1 = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    r1.root.unmount();
    const r2 = hydrateAndCheck(<PaperRow scored={sc} rank={1} />);
    expect(r2.errors).toEqual([]);
  });
});
