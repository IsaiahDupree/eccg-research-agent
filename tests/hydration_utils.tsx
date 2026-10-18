/**
 * SSR → hydrate test helper.
 *
 * React 19 logs hydration mismatches via console.error. To detect them we
 * spy on console.error during hydrateRoot, then assert the spy was never
 * called. Wrap each component test in `withHydrationCheck` so we don't
 * miss subtle mismatches that React tolerates (the page still renders
 * but the console flares).
 */

import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act } from "react";
import { vi, expect } from "vitest";
import type { ReactElement } from "react";
import type { ScoredPaper, Paper } from "@/lib/models";
import type { TrendingItem } from "@/components/TrendingStrip";

export interface HydrationResult {
  container: HTMLElement;
  root: Root;
  ssrHtml: string;
  errors: string[];
  warnings: string[];
}

/**
 * Render an element to a string (server) then hydrate it into a detached
 * container (client). Spies on console.error/warn to capture hydration
 * mismatches. Returns the container so tests can assert DOM, and the root
 * so they can update / unmount.
 */
export function hydrateAndCheck(
  element: ReactElement,
  opts: { container?: HTMLElement } = {},
): HydrationResult {
  const ssrHtml = renderToString(element);
  const container = opts.container ?? document.createElement("div");
  container.innerHTML = ssrHtml;
  document.body.appendChild(container);

  const errors: string[] = [];
  const warnings: string[] = [];
  const errSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.map(String).join(" "));
  });
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
    warnings.push(args.map(String).join(" "));
  });

  let root: Root;
  act(() => {
    root = hydrateRoot(container, element);
  });

  errSpy.mockRestore();
  warnSpy.mockRestore();

  return { container, root: root!, ssrHtml, errors, warnings };
}

/** Drain any post-hydration effects (useEffect runs in microtask). */
export async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/**
 * Stub global fetch in a controlled way. Returns the spy so tests can
 * inspect the call list. Restore by calling the returned `restore()`.
 */
export function stubFetch(
  responder: (url: string, init?: RequestInit) => unknown,
): { spy: ReturnType<typeof vi.fn>; restore: () => void } {
  const original = globalThis.fetch;
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = responder(url, init);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = spy as unknown as typeof fetch;
  return {
    spy,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

// ---- Fixture builders ------------------------------------------------------

export function mkPaper(over: Partial<Paper> = {}): Paper {
  return {
    id: "arxiv-2402.18221",
    arxiv_id: "2402.18221",
    title: "A representative event-camera paper",
    abstract: "Abstract for testing hydration.",
    authors: [{ name: "Alice Author" }, { name: "Bob Builder" }],
    venue: { name: "CVPR", type: "conference" },
    published_at: "2024-03-01T00:00:00Z",
    categories: ["cs.CV"],
    citation_count: 42,
    months_since_publish: 6,
    citations_per_month: 7,
    eccg_relevance: 0.85,
    eccg_category: "slam",
    ...over,
  };
}

export function mkScored(over: Partial<ScoredPaper> = {}): ScoredPaper {
  return {
    paper: mkPaper(over.paper),
    total: 78,
    categories: [],
    ...over,
  };
}

export function mkTrending(over: Partial<TrendingItem> = {}): TrendingItem {
  return {
    scored: mkScored(),
    multiplier: 3.4,
    trend_score: 2.1,
    ...over,
  };
}
