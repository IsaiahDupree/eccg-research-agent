"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Flame, AlertTriangle, GitBranch } from "lucide-react";
import { Badge } from "@/components/Badge";
import { VoteWidget } from "@/components/VoteWidget";
import { loadSeedPipelineClient } from "@/lib/seed_client";
import { useVotes, hotness } from "@/lib/votes_client";
import { getIntentCounts } from "@/lib/citations";
import { matchesNiche, NICHES, DEFAULT_NICHE } from "@/lib/niches";
import { useNiche } from "@/lib/niche_client";
import { categoryLabel, formatMonthsAgo } from "@/lib/utils";
import type { ScoredPaper } from "@/lib/models";
import { cn } from "@/lib/utils";

type Mode = "top" | "hot" | "controversial" | "influence";

const MODES: { mode: Mode; label: string; Icon: typeof Trophy; help: string }[] = [
  { mode: "top",           label: "Top",           Icon: Trophy,         help: "Highest net votes" },
  { mode: "hot",           label: "Hot",           Icon: Flame,          help: "Reddit-style: vote magnitude × recency" },
  { mode: "influence",     label: "Influence",     Icon: GitBranch,      help: "Community votes + in-corpus replication-strength citations" },
  { mode: "controversial", label: "Controversial", Icon: AlertTriangle,  help: "Most up AND down votes — points of disagreement" },
];

function row_influence(r: { influence: number }): number {
  return r.influence;
}

interface InfluencePoint {
  id: string;
  title: string;
  cited_by: number;
  replication: number;
  influence: number;
}

function InfluenceThumbnail({ rows }: { rows: InfluencePoint[] }) {
  const maxCited = Math.max(1, ...rows.map((r) => r.cited_by));
  const maxRepl = Math.max(1, ...rows.map((r) => r.replication));
  const maxInf = Math.max(1, ...rows.map((r) => r.influence));
  const W = 640;
  const H = 200;
  const pad = { l: 36, r: 16, t: 10, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const xFor = (cited: number) => pad.l + (cited / maxCited) * innerW;
  const yFor = (repl: number) => pad.t + innerH - (repl / maxRepl) * innerH;
  const rFor = (inf: number) => 2 + Math.sqrt(inf / maxInf) * 8;

  // Gridlines at quartiles
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxCited);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxRepl);

  return (
    <div className="mb-4 rounded-lg border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <div>
          <strong className="text-sm">Influence map</strong>
          <span className="ml-2 text-muted-foreground">
            top {rows.length} — circle size ∝ influence score
          </span>
        </div>
        <div className="text-muted-foreground">
          x: total citations in corpus · y: replication-strength citations
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full text-muted-foreground"
        role="img"
        aria-label="Scatter plot: in-corpus citation count vs replication-strength citations"
      >
        {/* gridlines */}
        {xTicks.map((t, i) => (
          <line
            key={`xt-${i}`}
            x1={xFor(t)}
            x2={xFor(t)}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke="currentColor"
            strokeOpacity={i === 0 ? 0.4 : 0.1}
            strokeWidth={1}
          />
        ))}
        {yTicks.map((t, i) => (
          <line
            key={`yt-${i}`}
            x1={pad.l}
            x2={pad.l + innerW}
            y1={yFor(t)}
            y2={yFor(t)}
            stroke="currentColor"
            strokeOpacity={i === 0 ? 0.4 : 0.1}
            strokeWidth={1}
          />
        ))}
        {/* axis labels */}
        {[0, maxCited].map((t, i) => (
          <text
            key={`xl-${i}`}
            x={xFor(t)}
            y={H - 6}
            fontSize={10}
            textAnchor={i === 0 ? "start" : "end"}
            fill="currentColor"
          >
            {Math.round(t)}
          </text>
        ))}
        {[0, maxRepl].map((t, i) => (
          <text
            key={`yl-${i}`}
            x={pad.l - 6}
            y={yFor(t) + (i === 0 ? -3 : 9)}
            fontSize={10}
            textAnchor="end"
            fill="currentColor"
          >
            {Math.round(t)}
          </text>
        ))}
        {/* y=x reference line (replication == cited) */}
        {(() => {
          const lim = Math.min(maxCited, maxRepl);
          if (lim <= 0) return null;
          return (
            <line
              x1={xFor(0)}
              y1={yFor(0)}
              x2={xFor(lim)}
              y2={yFor(lim)}
              stroke="currentColor"
              strokeDasharray="3 3"
              strokeOpacity={0.2}
            />
          );
        })()}
        {/* points */}
        {rows.map((r) => (
          <a key={r.id} href={`/paper/${encodeURIComponent(r.id)}`}>
            <circle
              cx={xFor(r.cited_by)}
              cy={yFor(r.replication)}
              r={rFor(r.influence)}
              fill="currentColor"
              fillOpacity={0.55}
              className="text-accent transition-opacity hover:fill-opacity-90"
            >
              <title>{`${r.title}\nin-corpus: ${r.cited_by} · replication: ${r.replication} · influence: ${r.influence.toFixed(1)}`}</title>
            </circle>
          </a>
        ))}
        {/* highlight top 3 with labels */}
        {rows
          .slice()
          .sort((a, b) => b.influence - a.influence)
          .slice(0, 3)
          .map((r) => {
            const cx = xFor(r.cited_by);
            const cy = yFor(r.replication);
            const lx = Math.min(cx + 8, W - pad.r - 4);
            return (
              <text
                key={`lbl-${r.id}`}
                x={lx}
                y={cy - 6}
                fontSize={10}
                fill="currentColor"
                className="pointer-events-none text-foreground"
              >
                {r.title.length > 36 ? `${r.title.slice(0, 36)}…` : r.title}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

export default function LeaderboardPage() {
  const [scored, setScored] = useState<ScoredPaper[]>([]);
  const [mode, setMode] = useState<Mode>("top");
  const { votes, loaded } = useVotes();
  const { niche, set: setNiche, mounted } = useNiche();

  useEffect(() => {
    setScored(loadSeedPipelineClient().scored);
  }, []);

  // Apply the niche filter once data is mounted. event_camera is permissive
  // (matchesNiche short-circuits to true), so the default behaviour is
  // unchanged unless the user actively switches.
  const nicheFilteredScored = useMemo(() => {
    if (!mounted || niche.slug === DEFAULT_NICHE.slug) return scored;
    return scored.filter((s) =>
      matchesNiche(`${s.paper.title} ${s.paper.abstract}`, niche),
    );
  }, [scored, niche, mounted]);

  const byId = useMemo(
    () => new Map(nicheFilteredScored.map((s) => [s.paper.id, s])),
    [nicheFilteredScored],
  );

  const ranked = useMemo(() => {
    // Influence mode considers every paper in the corpus, not just papers
    // that have been voted on — because in-corpus replication is its own
    // signal even before the team casts votes.
    if (mode === "influence") {
      const rows = nicheFilteredScored
        .map((s) => {
          const v = votes[s.paper.id] ?? { up: 0, down: 0, net: 0 };
          const weighted = v.weighted_net ?? v.net;
          const ic = getIntentCounts(s.paper.id);
          // Editor-weighted votes feed influence — that's the signal we
          // explicitly trust more than anonymous casts.
          const inf =
            ic.replication * 2 +
            ic.total * 0.5 +
            weighted * 1.5;
          return {
            scored: s,
            up: v.up,
            down: v.down,
            net: v.net,
            weighted_net: weighted,
            editor_up: v.editor_up ?? 0,
            editor_down: v.editor_down ?? 0,
            hot: hotness(weighted, s.paper.months_since_publish),
            controversy: Math.min(v.up, v.down) * Math.log2(v.up + v.down + 1),
            replication: ic.replication,
            cited_by: ic.total,
            influence: inf,
          };
        })
        .filter((r) => r.influence > 0)
        .sort((a, b) => b.influence - a.influence);
      return rows;
    }

    const rows = Object.entries(votes)
      .map(([id, v]) => {
        const s = byId.get(id);
        if (!s) return null;
        const ic = getIntentCounts(id);
        const weighted = v.weighted_net ?? v.net;
        return {
          scored: s,
          up: v.up,
          down: v.down,
          net: v.net,
          weighted_net: weighted,
          editor_up: v.editor_up ?? 0,
          editor_down: v.editor_down ?? 0,
          hot: hotness(weighted, s.paper.months_since_publish),
          controversy: Math.min(v.up, v.down) * Math.log2(v.up + v.down + 1),
          replication: ic.replication,
          cited_by: ic.total,
          influence: 0,
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    if (mode === "top") rows.sort((a, b) => b.weighted_net - a.weighted_net || b.up - a.up);
    else if (mode === "hot") rows.sort((a, b) => b.hot - a.hot);
    else rows.sort((a, b) => b.controversy - a.controversy);
    return rows;
  }, [nicheFilteredScored, votes, byId, mode]);

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

      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
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
          {ranked.length.toLocaleString()} paper{ranked.length === 1 ? "" : "s"}{" "}
          {mode === "influence" ? "ranked" : "voted on"}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-muted-foreground">Niche:</span>
        {NICHES.map((n) => (
          <button
            key={n.slug}
            type="button"
            onClick={() => setNiche(n.slug)}
            aria-pressed={niche.slug === n.slug}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5",
              niche.slug === n.slug
                ? "border-accent bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
          >
            {n.label}
          </button>
        ))}
        {niche.slug !== DEFAULT_NICHE.slug && (
          <span className="ml-2 text-muted-foreground">
            {nicheFilteredScored.length} / {scored.length} papers in scope
          </span>
        )}
      </div>

      {mode === "influence" && ranked.length > 0 && (
        <InfluenceThumbnail
          rows={ranked.slice(0, 60).map((r) => ({
            id: r.scored.paper.id,
            title: r.scored.paper.title,
            cited_by: r.cited_by,
            replication: r.replication,
            influence: row_influence(r),
          }))}
        />
      )}

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
                    {(row.editor_up > 0 || row.editor_down > 0) && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-950 dark:text-amber-300" title="Editor votes count 2× in influence math">
                        ★{row.editor_up + row.editor_down}
                      </span>
                    )}
                  </div>
                  {mode === "hot" && <div>hot {row.hot.toFixed(2)}</div>}
                  {mode === "controversial" && (
                    <div>controversy {row.controversy.toFixed(1)}</div>
                  )}
                  {mode === "influence" && (
                    <div className="space-y-0.5">
                      <div className="text-foreground">
                        <strong>{row.influence.toFixed(1)}</strong>
                      </div>
                      <div>
                        in {row.cited_by} · repl {row.replication}
                      </div>
                    </div>
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
