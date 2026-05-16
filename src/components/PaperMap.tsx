"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { categoryLabel } from "@/lib/utils";
import type { ScoredPaper } from "@/lib/models";

interface PaperMapProps {
  scored: ScoredPaper[];
}

// A lightweight force-graph layout: papers are nodes; categories are pulled
// together by an attractive force, citations would be edges in V1.1. For V1
// we deterministically place nodes in concentric category clusters so the
// view is fast and SSR-friendly.

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

export function PaperMap({ scored }: PaperMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Group by category
  const groups = useMemo(() => {
    const m = new Map<string, ScoredPaper[]>();
    for (const s of scored) {
      const slug = s.paper.eccg_category ?? "unclassified";
      if (!m.has(slug)) m.set(slug, []);
      m.get(slug)!.push(s);
    }
    return Array.from(m, ([slug, papers]) => ({ slug, papers }))
      .sort((a, b) => b.papers.length - a.papers.length);
  }, [scored]);

  // Deterministic layout: each group gets a slot on a polar grid
  const layout = useMemo(() => {
    const W = 900;
    const H = 600;
    const cx = W / 2;
    const cy = H / 2;
    const slots = groups.length;
    const placed: { id: string; x: number; y: number; r: number; color: string; slug: string }[] = [];
    groups.forEach((g, gi) => {
      const angle = (gi / slots) * Math.PI * 2;
      const groupR = 220;
      const groupCx = cx + Math.cos(angle) * groupR;
      const groupCy = cy + Math.sin(angle) * groupR;
      g.papers.forEach((s, pi) => {
        const pAngle = angle + (pi - g.papers.length / 2) * 0.18;
        const pRadius = 30 + (pi % 3) * 28;
        const x = groupCx + Math.cos(pAngle) * pRadius;
        const y = groupCy + Math.sin(pAngle) * pRadius;
        const r = 6 + Math.min(20, s.paper.citation_count * 0.18);
        placed.push({
          id: s.paper.id,
          x,
          y,
          r,
          color: colorFor(g.slug),
          slug: g.slug,
        });
      });
    });
    return { width: W, height: H, nodes: placed };
  }, [groups]);

  const hoveredPaper = useMemo(
    () => scored.find((s) => s.paper.id === hovered),
    [hovered, scored],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {groups.map((g) => (
          <span key={g.slug} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: colorFor(g.slug) }}
            />
            {categoryLabel(g.slug)} ({g.papers.length})
          </span>
        ))}
      </div>
      <div className="relative w-full overflow-hidden rounded-lg border bg-background">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="block h-[600px] w-full"
        >
          <defs>
            <radialGradient id="halo">
              <stop offset="0%" stopColor="#fff" stopOpacity={0} />
              <stop offset="100%" stopColor="#fff" stopOpacity={0} />
            </radialGradient>
          </defs>
          {layout.nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              <circle
                r={n.r + 6}
                fill={n.color}
                fillOpacity={hovered === n.id ? 0.25 : 0}
                className="transition-all"
              />
              <Link href={`/paper/${encodeURIComponent(n.id)}`}>
                <circle
                  r={n.r}
                  fill={n.color}
                  stroke={hovered === n.id ? "var(--foreground)" : "transparent"}
                  strokeWidth={1.5}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered((cur) => (cur === n.id ? null : cur))}
                />
              </Link>
            </g>
          ))}
        </svg>
        {hoveredPaper && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 max-w-xl rounded-md border bg-background/95 p-3 text-sm shadow-md">
            <div className="line-clamp-1 font-medium">{hoveredPaper.paper.title}</div>
            <div className="line-clamp-2 text-xs text-muted-foreground">
              {hoveredPaper.paper.authors.map((a) => a.name).slice(0, 4).join(", ")} ·{" "}
              {hoveredPaper.paper.venue?.name ?? "preprint"} ·{" "}
              score {hoveredPaper.total.toFixed(0)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
