// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { FilterBar } from "@/components/FilterBar";
import { hydrateAndCheck } from "./hydration_utils";

// Normalize trivial SSR/jsdom-string differences (self-closing void
// elements: `<input … />` from renderToString vs `<input …>` from
// jsdom) so hydration-equivalence tests don't fail on cosmetic noise.
function normaliseHtml(s: string): string {
  return s.replace(/\s*\/>/g, ">");
}

const CATEGORIES = [
  { slug: "slam", count: 12 },
  { slug: "optical_flow", count: 8 },
  { slug: "depth", count: 5 },
];

describe("FilterBar — hydration", () => {
  it("hydrates without console errors", () => {
    const { errors } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(errors).toEqual([]);
  });

  it("hydrates without console warnings", () => {
    const { warnings } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(warnings).toEqual([]);
  });

  it("DOM matches SSR after hydration (modulo void-element form)", () => {
    const { ssrHtml, container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(normaliseHtml(container.innerHTML)).toBe(normaliseHtml(ssrHtml));
  });

  it("renders the search input", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(container.querySelector("input[type='search']")).toBeTruthy();
  });

  it("search input value reflects query prop", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query="slam"
        onQueryChange={() => {}}
      />,
    );
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("slam");
  });

  it("renders one chip per category (+ 'All')", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    const chips = container.querySelectorAll("button");
    expect(chips.length).toBeGreaterThanOrEqual(CATEGORIES.length + 1);
  });

  it("displays category counts", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("8");
    expect(container.textContent).toContain("5");
  });

  it("'All' chip is pressed when no active categories", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    const all = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "All",
    );
    expect(all?.className).toContain("bg-accent");
  });

  it("active category chip styles differently", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={["slam"]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    const slam = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.toLowerCase().includes("slam"),
    );
    expect(slam?.getAttribute("aria-pressed")).toBe("true");
  });

  it("clear button is hidden when no active categories", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("clear 0");
  });

  it("clear button shows count when categories active", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={["slam", "depth"]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(container.textContent).toContain("clear 2");
  });

  it("AND hint shows when multiple active", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={["slam", "depth"]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(container.textContent).toContain("AND filter");
  });

  it("AND hint absent when single active", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={["slam"]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("AND filter");
  });

  it("displays totalMatching count when provided", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
        totalMatching={42}
      />,
    );
    expect(container.textContent).toContain("42");
    expect(container.textContent).toContain("match");
  });

  it("singular 'match' when total = 1", () => {
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
        totalMatching={1}
      />,
    );
    expect(container.textContent).toContain("1 match");
    expect(container.textContent).not.toContain("matches");
  });

  it("renders fine with zero categories", () => {
    const { errors } = hydrateAndCheck(
      <FilterBar
        categories={[]}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(errors).toEqual([]);
  });

  it("calls onQueryChange when input changes", () => {
    const onChange = vi.fn();
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={onChange}
      />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("calls onToggle on category-chip click", () => {
    const onToggle = vi.fn();
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={onToggle}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    const slam = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.toLowerCase().includes("slam"),
    );
    slam?.click();
    expect(onToggle).toHaveBeenCalledWith("slam");
  });

  it("calls onClear on All-chip click", () => {
    const onClear = vi.fn();
    const { container } = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={["slam"]}
        onToggle={() => {}}
        onClear={onClear}
        query=""
        onQueryChange={() => {}}
      />,
    );
    const all = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "All",
    );
    all?.click();
    expect(onClear).toHaveBeenCalled();
  });

  it("hydration is stable across re-mount", () => {
    const r1 = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    r1.root.unmount();
    const r2 = hydrateAndCheck(
      <FilterBar
        categories={CATEGORIES}
        active={[]}
        onToggle={() => {}}
        onClear={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(r2.errors).toEqual([]);
  });
});
