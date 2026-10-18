"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { Badge } from "./Badge";
import { cn, categoryLabel } from "@/lib/utils";

interface FilterBarProps {
  categories: { slug: string; count: number }[];
  active: string[];                       // multi-select: AND semantics
  onToggle: (slug: string) => void;
  onClear: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  totalMatching?: number;
}

export function FilterBar({
  categories,
  active,
  onToggle,
  onClear,
  query,
  onQueryChange,
  totalMatching,
}: FilterBarProps) {
  const sorted = useMemo(
    () => [...categories].sort((a, b) => b.count - a.count),
    [categories],
  );
  const activeSet = useMemo(() => new Set(active), [active]);

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search title, author, abstract…"
          className="w-72 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {typeof totalMatching === "number" && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {totalMatching.toLocaleString()} match{totalMatching === 1 ? "" : "es"}
          </span>
        )}
        {active.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            title="Clear category filters"
          >
            <X className="h-3 w-3" /> clear {active.length}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={onClear}
          className={cn(
            "rounded-full px-3 py-1 text-xs",
            active.length === 0
              ? "bg-accent text-accent-foreground"
              : "bg-muted hover:bg-muted/80",
          )}
        >
          All
        </button>
        {sorted.map((c) => {
          const on = activeSet.has(c.slug);
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => onToggle(c.slug)}
              aria-pressed={on}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                on
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted hover:bg-muted/80",
              )}
            >
              {categoryLabel(c.slug)}
              <Badge
                variant="outline"
                className={cn("ml-1 border-current", on && "text-accent-foreground")}
              >
                {c.count}
              </Badge>
            </button>
          );
        })}
      </div>
      {active.length > 1 && (
        <p className="text-[11px] text-muted-foreground">
          AND filter — papers matching every selected category will be shown.
        </p>
      )}
    </div>
  );
}
