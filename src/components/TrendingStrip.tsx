import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Badge } from "./Badge";
import { categoryLabel, formatMonthsAgo } from "@/lib/utils";
import type { ScoredPaper } from "@/lib/models";

export interface TrendingItem {
  scored: ScoredPaper;
  multiplier: number;        // citations_per_month vs venue baseline
  trend_score: number;       // recency-weighted multiplier
}

interface Props {
  items: TrendingItem[];
}

/**
 * Three pinned cards above the main list when no filters are active.
 * Surfaces papers with the steepest citations/month relative to their
 * venue baseline, gently weighted for recency so 5-year-old workhorses
 * don't permanently camp the top spots.
 */
export function TrendingStrip({ items }: Props) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6 rounded-lg border bg-card p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        Trending now
        <span className="ml-1 normal-case text-muted-foreground/80">
          — papers earning citations fastest, recency-weighted
        </span>
      </h2>
      <ol className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {items.map((it, i) => {
          const p = it.scored.paper;
          return (
            <li
              key={p.id}
              className="rounded-md border bg-background p-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  #{i + 1}
                </span>
                <Badge variant="success" className="text-[10px]">
                  {it.multiplier.toFixed(1)}× venue
                </Badge>
              </div>
              <Link
                href={`/paper/${encodeURIComponent(p.id)}`}
                className="mt-1 line-clamp-2 block text-sm font-medium hover:underline"
              >
                {p.title}
              </Link>
              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                {p.authors.slice(0, 2).map((a) => a.name).join(", ")}
                {p.authors.length > 2 && ` +${p.authors.length - 2}`}
                {" · "}
                {p.venue?.name ?? "preprint"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>{p.citations_per_month.toFixed(1)} cpm</span>
                <span aria-hidden>·</span>
                <span>{formatMonthsAgo(p.months_since_publish)}</span>
                {p.eccg_category && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{categoryLabel(p.eccg_category)}</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
