// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { TrendingStrip } from "@/components/TrendingStrip";
import { hydrateAndCheck, mkScored, mkTrending } from "./hydration_utils";

describe("TrendingStrip — hydration", () => {
  it("hydrates without console errors", () => {
    const { errors } = hydrateAndCheck(<TrendingStrip items={[mkTrending()]} />);
    expect(errors).toEqual([]);
  });

  it("hydrates without console warnings", () => {
    const { warnings } = hydrateAndCheck(<TrendingStrip items={[mkTrending()]} />);
    expect(warnings).toEqual([]);
  });

  it("renders nothing for empty items", () => {
    const { ssrHtml } = hydrateAndCheck(<TrendingStrip items={[]} />);
    expect(ssrHtml).toBe("");
  });

  it("server HTML survives hydration intact", () => {
    const items = [mkTrending(), mkTrending({ scored: mkScored({ paper: { ...mkScored().paper, id: "arxiv-2" } }) })];
    const { ssrHtml, container } = hydrateAndCheck(<TrendingStrip items={items} />);
    // The text content should be present in both SSR HTML and the hydrated DOM.
    expect(container.textContent).toContain("Trending now");
    expect(ssrHtml).toContain("Trending now");
  });

  it("hydration preserves paper titles", () => {
    const items = [mkTrending()];
    const { container } = hydrateAndCheck(<TrendingStrip items={items} />);
    expect(container.textContent).toContain(items[0].scored.paper.title);
  });

  it("renders one card per item up to provided length", () => {
    const items = [mkTrending(), mkTrending({
      scored: mkScored({ paper: { ...mkScored().paper, id: "arxiv-2" } }),
    })];
    const { container } = hydrateAndCheck(<TrendingStrip items={items} />);
    expect(container.querySelectorAll("li").length).toBe(2);
  });

  it("renders multiplier formatted to 1 decimal place", () => {
    const items = [mkTrending({ multiplier: 4.234 })];
    const { container } = hydrateAndCheck(<TrendingStrip items={items} />);
    expect(container.textContent).toContain("4.2× venue");
  });

  it("preserves rank numbering (#1, #2, #3)", () => {
    const items = [mkTrending(), mkTrending({
      scored: mkScored({ paper: { ...mkScored().paper, id: "arxiv-2" } }),
    }), mkTrending({
      scored: mkScored({ paper: { ...mkScored().paper, id: "arxiv-3" } }),
    })];
    const { container } = hydrateAndCheck(<TrendingStrip items={items} />);
    expect(container.textContent).toContain("#1");
    expect(container.textContent).toContain("#2");
    expect(container.textContent).toContain("#3");
  });

  it("links to /paper/<encoded-id>", () => {
    const items = [mkTrending()];
    const { container } = hydrateAndCheck(<TrendingStrip items={items} />);
    const a = container.querySelector("a[href^='/paper/']");
    expect(a?.getAttribute("href")).toBe(`/paper/${encodeURIComponent(items[0].scored.paper.id)}`);
  });

  it("renders venue name when present", () => {
    const { container } = hydrateAndCheck(<TrendingStrip items={[mkTrending()]} />);
    expect(container.textContent).toContain("CVPR");
  });

  it("falls back to 'preprint' when venue is undefined", () => {
    const items = [mkTrending({
      scored: mkScored({ paper: { ...mkScored().paper, venue: undefined } }),
    })];
    const { container } = hydrateAndCheck(<TrendingStrip items={items} />);
    expect(container.textContent).toContain("preprint");
  });

  it("does not throw when items have no eccg_category", () => {
    const items = [mkTrending({
      scored: mkScored({ paper: { ...mkScored().paper, eccg_category: undefined } }),
    })];
    expect(() => hydrateAndCheck(<TrendingStrip items={items} />)).not.toThrow();
  });

  it("renders authors with truncation", () => {
    const items = [mkTrending({
      scored: mkScored({
        paper: {
          ...mkScored().paper,
          authors: [
            { name: "A One" },
            { name: "B Two" },
            { name: "C Three" },
            { name: "D Four" },
          ],
        },
      }),
    })];
    const { container } = hydrateAndCheck(<TrendingStrip items={items} />);
    expect(container.textContent).toContain("A One, B Two");
    expect(container.textContent).toContain("+2"); // truncation marker
  });

  it("survives the SSR → hydrate roundtrip without DOM differences", () => {
    const items = [mkTrending()];
    const { ssrHtml, container } = hydrateAndCheck(<TrendingStrip items={items} />);
    // After hydration the innerHTML matches the SSR string (no mismatches).
    expect(container.innerHTML).toBe(ssrHtml);
  });

  it("can hydrate, unmount, re-hydrate without leaking warnings", () => {
    const items = [mkTrending()];
    const r1 = hydrateAndCheck(<TrendingStrip items={items} />);
    r1.root.unmount();
    const r2 = hydrateAndCheck(<TrendingStrip items={items} />);
    expect(r2.errors).toEqual([]);
    expect(r2.warnings).toEqual([]);
  });
});
