"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Flame, Sparkles, Trophy } from "lucide-react";
import { FilterBar } from "./FilterBar";
import { PaperRow } from "./PaperRow";
import { hotness, netToRubricRaw, useVotes } from "@/lib/votes_client";
import { asScored, useCustomCorpus } from "@/lib/custom_corpus_client";
import { useNiche } from "@/lib/niche_client";
import { matchesNiche } from "@/lib/niches";
import { cn } from "@/lib/utils";
import type { ScoredPaper } from "@/lib/models";

interface PaperListProps {
  scored: ScoredPaper[];
}

const PAGE_SIZE = 50;

type SortMode = "top" | "hot" | "new";

const SORT_MODES: { mode: SortMode; label: string; Icon: typeof Flame; help: string }[] = [
  { mode: "top",  label: "Top",  Icon: Trophy,   help: "Rubric score + community votes" },
  { mode: "hot",  label: "Hot",  Icon: Flame,    help: "Vote momentum, recency-decayed" },
  { mode: "new",  label: "New",  Icon: Sparkles, help: "Most recently published" },
];

function parseCategoryParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseSortParam(raw: string | null): SortMode {
  return raw === "hot" || raw === "new" ? raw : "top";
}

function communityBoost(net: number | undefined): number {
  if (!net) return 0;
  const raw = netToRubricRaw(net);             // 0-10
  return ((raw - 5) * 10) / 10;
}

export function PaperList({ scored }: PaperListProps) {
  const params = useSearchParams();
  const [active, setActive] = useState<string[]>(parseCategoryParam(params.get("category")));
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState<SortMode>(parseSortParam(params.get("sort")));
  const [page, setPage] = useState(0);
  const { votes } = useVotes();
  const { records: uploaded } = useCustomCorpus();
  const { niche } = useNiche();

  useEffect(() => {
    setQuery(params.get("q") ?? "");
    setActive(parseCategoryParam(params.get("category")));
    setSort(parseSortParam(params.get("sort")));
    setPage(0);
  }, [params]);

  const merged = useMemo(() => {
    const knownIds = new Set(scored.map((s) => s.paper.id));
    const additions = uploaded
      // Hide papers still in the review queue from the public rankings.
      .filter((r) => (r.status ?? "approved") === "approved")
      .filter((r) => !knownIds.has(r.paper.id))
      .map(asScored);
    const all = [...scored, ...additions];
    // Niche filter — event_camera is permissive (matchesNiche short-circuits).
    if (niche.slug === "event_camera") return all;
    return all.filter((s) =>
      matchesNiche(`${s.paper.title} ${s.paper.abstract}`, niche),
    );
  }, [scored, uploaded, niche]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of merged) {
      const slug = s.paper.eccg_category ?? "unclassified";
      m.set(slug, (m.get(slug) ?? 0) + 1);
    }
    return Array.from(m, ([slug, count]) => ({ slug, count }));
  }, [merged]);

  const sortedAndFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeSet = new Set(active);

    type Decorated = {
      scored: ScoredPaper;
      adjusted: number;
      hot: number;
      net: number;
    };

    const decorated: Decorated[] = merged.map((s) => {
      const net = votes[s.paper.id]?.net ?? 0;
      const boost = communityBoost(net);
      return {
        scored: s,
        adjusted: Math.min(100, s.total + boost),
        hot: hotness(net, s.paper.months_since_publish),
        net,
      };
    });

    const filtered = decorated.filter(({ scored: s }) => {
      if (activeSet.size > 0) {
        const slug = s.paper.eccg_category ?? "unclassified";
        if (!activeSet.has(slug)) return false;
      }
      if (!q) return true;
      const haystack =
        `${s.paper.title} ${s.paper.abstract} ${s.paper.authors.map((a) => a.name).join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });

    if (sort === "top") {
      filtered.sort((a, b) => b.adjusted - a.adjusted);
    } else if (sort === "hot") {
      filtered.sort((a, b) => {
        if (b.hot !== a.hot) return b.hot - a.hot;
        return b.adjusted - a.adjusted;
      });
    } else {
      filtered.sort(
        (a, b) => a.scored.paper.months_since_publish - b.scored.paper.months_since_publish,
      );
    }
    return filtered;
  }, [merged, query, active, sort, votes]);

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
  const pageItems = sortedAndFiltered.slice(pageStart, pageStart + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sortedAndFiltered.length / PAGE_SIZE));

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
        totalMatching={sortedAndFiltered.length}
      />

      <div className="mb-3 flex items-center gap-1 text-sm">
        <span className="mr-2 text-xs uppercase tracking-wide text-muted-foreground">Sort</span>
        {SORT_MODES.map(({ mode, label, Icon, help }) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              setSort(mode);
              setPage(0);
            }}
            aria-pressed={sort === mode}
            title={help}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors",
              sort === mode
                ? "border-accent bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          niche: <strong>{niche.label}</strong>
        </span>
      </div>

      <div className="rounded-lg border">
        {sortedAndFiltered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No papers match the current filter.
          </div>
        ) : (
          pageItems.map((d, i) => (
            <PaperRow
              key={d.scored.paper.id}
              scored={d.scored}
              rank={pageStart + i + 1}
              displayScore={sort === "top" ? d.adjusted : d.scored.total}
              scoreSubLabel={
                sort === "hot"
                  ? `hot ${d.hot.toFixed(2)} · net ${d.net >= 0 ? "+" : ""}${d.net}`
                  : sort === "new"
                    ? `new · ${d.scored.paper.months_since_publish.toFixed(1)} mo old`
                    : d.net !== 0
                      ? `community ${d.net >= 0 ? "+" : ""}${d.net}`
                      : undefined
              }
            />
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
            {sortedAndFiltered.length.toLocaleString()} papers
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
