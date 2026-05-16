"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Flame, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/Badge";
import { VoteWidget } from "@/components/VoteWidget";
import { loadSeedPipelineClient } from "@/lib/seed_client";
import { useVotes, hotness } from "@/lib/votes_client";
import { categoryLabel, formatMonthsAgo } from "@/lib/utils";
import type { ScoredPaper } from "@/lib/models";
import { cn } from "@/lib/utils";

type Mode = "top" | "hot" | "controversial";

const MODES: { mode: Mode; label: string; Icon: typeof Trophy; help: string }[] = [
  { mode: "top",           label: "Top",           Icon: Trophy,         help: "Highest net votes" },
  { mode: "hot",           label: "Hot",           Icon: Flame,          help: "Reddit-style: vote magnitude × recency" },
  { mode: "controversial", label: "Controversial", Icon: AlertTriangle,  help: "Most up AND down votes — points of disagreement" },
];

export default function LeaderboardPage() {
  const [scored, setScored] = useState<ScoredPaper[]>([]);
  const [mode, setMode] = useState<Mode>("top");
  const { votes, loaded } = useVotes();

  useEffect(() => {
    setScored(loadSeedPipelineClient().scored);
  }, []);

  const byId = useMemo(() => new Map(scored.map((s) => [s.paper.id, s])), [scored]);

  const ranked = useMemo(() => {
    const rows = Object.entries(votes)
      .map(([id, v]) => {
        const s = byId.get(id);
        if (!s) return null;
        return {
          scored: s,
          up: v.up,
          down: v.down,
          net: v.net,
          hot: hotness(v.net, s.paper.months_since_publish),
          controversy: Math.min(v.up, v.down) * Math.log2(v.up + v.down + 1),
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    if (mode === "top") rows.sort((a, b) => b.net - a.net || b.up - a.up);
    else if (mode === "hot") rows.sort((a, b) => b.hot - a.hot);
    else rows.sort((a, b) => b.controversy - a.controversy);
    return rows;
  }, [votes, byId, mode]);

  return (
    <>
      <section className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Trophy className="h-6 w-6" aria-hidden /> Leaderboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The team-voted reading list. Papers that the ECCG community has
          actually flagged as worth your time — separate from the algorithmic
          score, which is everyone else&apos;s opinion.
        </p>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        {MODES.map(({ mode: m, label, Icon, help }) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            title={help}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors",
              mode === m
                ? "border-accent bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          {ranked.length.toLocaleString()} paper{ranked.length === 1 ? "" : "s"} voted on
        </span>
      </div>

      <ol className="rounded-lg border" suppressHydrationWarning>
        {!loaded ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading votes…
          </li>
        ) : ranked.length === 0 ? (
          <li className="flex flex-col items-center px-4 py-12 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm">No votes yet. Be the first.</p>
            <Link
              href="/"
              className="mt-4 text-sm text-accent underline-offset-4 hover:underline"
            >
              Browse papers →
            </Link>
          </li>
        ) : (
          ranked.map((row, i) => {
            const p = row.scored.paper;
            return (
              <li
                key={p.id}
                className="grid grid-cols-[3rem_auto_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0"
              >
                <div className="tabular-nums text-muted-foreground">#{i + 1}</div>
                <VoteWidget paperId={p.id} compact />
                <div className="min-w-0">
                  <Link
                    href={`/paper/${encodeURIComponent(p.id)}`}
                    className="line-clamp-1 font-medium hover:underline"
                  >
                    {p.title}
                  </Link>
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {p.authors.slice(0, 2).map((a) => a.name).join(", ")}
                    {p.authors.length > 2 && ` +${p.authors.length - 2}`} ·{" "}
                    {p.venue?.name ?? "preprint"} ·{" "}
                    {formatMonthsAgo(p.months_since_publish)}
                    {p.eccg_category && (
                      <>
                        {" · "}
                        <span>{categoryLabel(p.eccg_category)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs tabular-nums text-muted-foreground">
                  <div>
                    <span className="text-emerald-700 dark:text-emerald-400">↑{row.up}</span>
                    {" / "}
                    <span className="text-rose-700 dark:text-rose-400">↓{row.down}</span>
                  </div>
                  {mode === "hot" && <div>hot {row.hot.toFixed(2)}</div>}
                  {mode === "controversial" && (
                    <div>controversy {row.controversy.toFixed(1)}</div>
                  )}
                  {mode === "top" && row.net !== 0 && (
                    <div>
                      <Badge variant={row.net > 0 ? "success" : "muted"} className="text-[10px]">
                        net {row.net >= 0 ? "+" : ""}
                        {row.net}
                      </Badge>
                    </div>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ol>
    </>
  );
}
