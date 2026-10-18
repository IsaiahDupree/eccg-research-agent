"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ScoredPaper } from "@/lib/models";
import { categoryLabel } from "@/lib/utils";

interface InfluenceMapProps {
  scored: ScoredPaper[];
  /** per-paper in-corpus replication count from the citation graph */
  replicationByPaper: Record<string, number>;
  /** per-paper total in-corpus cited-by count */
  citedByPaper: Record<string, number>;
}

const CATEGORY_COLORS: Record<string, string> = {
  survey: "#6366f1",
  reconstruction: "#f97316",
  optical_flow: "#0ea5e9",
  depth: "#22c55e",
  slam: "#a855f7",
  segmentation: "#eab308",
  recognition: "#06b6d4",
  object_detection: "#ef4444",
  control_robotics: "#14b8a6",
  device_sensor: "#84cc16",
  dataset: "#f43f5e",
  simulator: "#8b5cf6",
  neuromorphic_hardware: "#0891b2",
  snn: "#d946ef",
  signal_processing: "#64748b",
  feature_tracking: "#3b82f6",
  tactile_other: "#ec4899",
  unclassified: "#a1a1aa",
};

function colorFor(slug?: string): string {
  return CATEGORY_COLORS[slug ?? "unclassified"] ?? CATEGORY_COLORS.unclassified;
}

/**
 * 2-D influence-flow map:
 *   x-axis = publish year
 *   y-axis = log2(replication-strength + 1)  (capped 0-10)
 *   marker size = total in-corpus cited_by
 *   color = ECCG taxonomy category
 *
 * Replaces the older category-cluster layout. Captures the Neuro_Vision_Map
 * vibe but for paper influence, not institutions.
 */
export function InfluenceMap({ scored, replicationByPaper, citedByPaper }: InfluenceMapProps) {
  const [hover, setHover] = useState<string | null>(null);

  // Only plot papers with at least one in-corpus citation OR a top-200
  // score — keeps the plot from drowning in singletons.
  const points = useMemo(() => {
    const ranked = [...scored].sort((a, b) => b.total - a.total);
    const top = new Set(ranked.slice(0, 300).map((s) => s.paper.id));
    return scored
      .filter((s) => citedByPaper[s.paper.id] > 0 || top.has(s.paper.id))
      .map((s) => {
        const year = new Date(s.paper.published_at).getUTCFullYear();
        const repl = replicationByPaper[s.paper.id] ?? 0;
        const cited = citedByPaper[s.paper.id] ?? 0;
        return { scored: s, year, repl, cited };
      });
  }, [scored, replicationByPaper, citedByPaper]);

  const { yearMin, yearMax, maxCited } = useMemo(() => {
    let yMin = Infinity, yMax = -Infinity, m = 0;
    for (const p of points) {
      if (p.year < yMin) yMin = p.year;
      if (p.year > yMax) yMax = p.year;
      if (p.cited > m) m = p.cited;
    }
    return {
      yearMin: Number.isFinite(yMin) ? yMin : 2014,
      yearMax: Number.isFinite(yMax) ? yMax : new Date().getUTCFullYear(),
      maxCited: m,
    };
  }, [points]);

  const W = 900;
  const H = 480;
  const padL = 40;
  const padR = 16;
  const padT = 14;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  function xFor(year: number): number {
    const span = Math.max(1, yearMax - yearMin);
    return padL + ((year - yearMin) / span) * innerW;
  }
  function yFor(repl: number): number {
    const v = Math.min(10, Math.log2(repl + 1));
    return padT + innerH - (v / 10) * innerH;
  }
  function sizeFor(cited: number): number {
    if (cited <= 0) return 2.5;
    return 3 + Math.sqrt(cited) * 1.6;
  }

  // Axis ticks
  const xTicks: number[] = [];
  for (let y = Math.ceil(yearMin); y <= yearMax; y++) xTicks.push(y);
  const yTicks = [0, 1, 2, 3, 4, 6, 8, 10];

  const hoveredPoint = points.find((p) => p.scored.paper.id === hover);

  // Distinct categories present (for legend)
  const cats = new Set<string>();
  for (const p of points) cats.add(p.scored.paper.eccg_category ?? "unclassified");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {Array.from(cats)
          .sort()
          .map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: colorFor(c) }}
                aria-hidden
              />
              {categoryLabel(c)}
            </span>
          ))}
      </div>
      <div className="relative w-full overflow-hidden rounded-lg border bg-background">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-[480px] w-full">
          {/* gridlines */}
          {yTicks.map((t) => (
            <line
              key={`yg-${t}`}
              x1={padL}
              x2={W - padR}
              y1={yFor(2 ** t - 1)}
              y2={yFor(2 ** t - 1)}
              stroke="currentColor"
              opacity={0.08}
              strokeDasharray="2 3"
            />
          ))}
          {xTicks.map((t) => (
            <line
              key={`xg-${t}`}
              x1={xFor(t)}
              x2={xFor(t)}
              y1={padT}
              y2={H - padB}
              stroke="currentColor"
              opacity={0.06}
            />
          ))}
          {/* axes */}
          <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="currentColor" opacity={0.4} />
          <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="currentColor" opacity={0.4} />
          {/* x labels */}
          {xTicks.map((t) => (
            <text
              key={`xl-${t}`}
              x={xFor(t)}
              y={H - padB + 14}
              fontSize="10"
              textAnchor="middle"
              fill="currentColor"
              opacity={0.6}
            >
              {t}
            </text>
          ))}
          {/* y labels */}
          {yTicks.map((t) => (
            <text
              key={`yl-${t}`}
              x={padL - 6}
              y={yFor(2 ** t - 1) + 3}
              fontSize="10"
              textAnchor="end"
              fill="currentColor"
              opacity={0.6}
            >
              {2 ** t - 1}
            </text>
          ))}
          <text
            x={padL}
            y={padT - 2}
            fontSize="10"
            textAnchor="start"
            fill="currentColor"
            opacity={0.6}
          >
            replication-strength →
          </text>
          {/* points */}
          {points.map((p) => {
            const x = xFor(p.year);
            const y = yFor(p.repl);
            const r = sizeFor(p.cited);
            const isHover = hover === p.scored.paper.id;
            return (
              <g key={p.scored.paper.id}>
                {isHover && (
                  <circle r={r + 6} cx={x} cy={y} fill={colorFor(p.scored.paper.eccg_category)} fillOpacity={0.2} />
                )}
                <Link href={`/paper/${encodeURIComponent(p.scored.paper.id)}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={colorFor(p.scored.paper.eccg_category)}
                    fillOpacity={isHover ? 1 : 0.75}
                    stroke={isHover ? "var(--foreground)" : "transparent"}
                    strokeWidth={1.5}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHover(p.scored.paper.id)}
                    onMouseLeave={() =>
                      setHover((cur) => (cur === p.scored.paper.id ? null : cur))
                    }
                  />
                </Link>
              </g>
            );
          })}
        </svg>
        {hoveredPoint && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 max-w-xl rounded-md border bg-background/95 p-3 text-sm shadow-md">
            <div className="line-clamp-1 font-medium">{hoveredPoint.scored.paper.title}</div>
            <div className="text-xs text-muted-foreground">
              {hoveredPoint.year} ·{" "}
              {hoveredPoint.scored.paper.eccg_category
                ? categoryLabel(hoveredPoint.scored.paper.eccg_category)
                : "Unclassified"}{" "}
              · cited-by {hoveredPoint.cited} · replication {hoveredPoint.repl} · score{" "}
              {hoveredPoint.scored.total.toFixed(0)}
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        X = publish year, Y = number of corpus papers that cite this work for
        methodology / result / extension (log scale). Marker size = total
        in-corpus cited-by. Top-right is what you want: recent papers that
        others already built on. Plot shows {points.length.toLocaleString()}{" "}
        papers (top-300 by score + everything with at least one in-corpus
        citation, max {maxCited}).
      </p>
    </div>
  );
}
