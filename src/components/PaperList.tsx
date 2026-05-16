"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FilterBar } from "./FilterBar";
import { PaperRow } from "./PaperRow";
import type { ScoredPaper } from "@/lib/models";

interface PaperListProps {
  scored: ScoredPaper[];
}

const PAGE_SIZE = 50;

function parseCategoryParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function PaperList({ scored }: PaperListProps) {
  const params = useSearchParams();
  const [active, setActive] = useState<string[]>(parseCategoryParam(params.get("category")));
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setQuery(params.get("q") ?? "");
    setActive(parseCategoryParam(params.get("category")));
    setPage(0);
  }, [params]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of scored) {
      const slug = s.paper.eccg_category ?? "unclassified";
      m.set(slug, (m.get(slug) ?? 0) + 1);
    }
    return Array.from(m, ([slug, count]) => ({ slug, count }));
  }, [scored]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeSet = new Set(active);
    return scored.filter((s) => {
      if (activeSet.size > 0) {
        // AND semantics: paper must satisfy every selected category. With
        // single-category papers this reduces to "any of the active set
        // matches the paper's category" — but the rule is uniform for V2
        // when a paper may have multiple categories.
        const slug = s.paper.eccg_category ?? "unclassified";
        if (!activeSet.has(slug)) return false;
      }
      if (!q) return true;
      const haystack =
        `${s.paper.title} ${s.paper.abstract} ${s.paper.authors.map((a) => a.name).join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [scored, active, query]);

  function toggleCategory(slug: string) {
    setActive((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      setPage(0);
      return next;
    });
  }

  function clearCategories() {
    setActive([]);
    setPage(0);
  }

  const pageStart = page * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <section>
      <FilterBar
        categories={categories}
        active={active}
        onToggle={toggleCategory}
        onClear={clearCategories}
        query={query}
        onQueryChange={(q) => {
          setQuery(q);
          setPage(0);
        }}
        totalMatching={filtered.length}
      />
      <div className="rounded-lg border">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No papers match the current filter.
          </div>
        ) : (
          pageItems.map((s, i) => (
            <PaperRow key={s.paper.id} scored={s} rank={pageStart + i + 1} />
          ))
        )}
      </div>
      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border px-3 py-1.5 disabled:opacity-40 hover:bg-muted disabled:hover:bg-transparent"
          >
            ← Prev
          </button>
          <span className="text-muted-foreground">
            Page {page + 1} of {totalPages.toLocaleString()} ·{" "}
            {filtered.length.toLocaleString()} papers
          </span>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border px-3 py-1.5 disabled:opacity-40 hover:bg-muted disabled:hover:bg-transparent"
          >
            Next →
          </button>
        </nav>
      )}
    </section>
  );
}
