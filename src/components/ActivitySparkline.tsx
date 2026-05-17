"use client";

import { useMemo } from "react";

interface ActivitySparklineProps {
  /** Timestamps (ISO) of events to bucket by UTC day. */
  events: { at: string; kind: "library" | "vote" | "note" | "upload" }[];
  /** How many trailing days to show. Default 7. */
  days?: number;
  /** Pixel height. */
  height?: number;
}

const KIND_COLORS: Record<string, string> = {
  library: "#6366f1",   // accent (indigo)
  vote: "#10b981",      // emerald
  note: "#f59e0b",      // amber
  upload: "#a855f7",    // violet
};

/**
 * Tiny stacked-bar SVG showing the last N days of activity from the
 * /whats-new event stream. Inline SVG so it renders SSR-safe and prints
 * cleanly in the markdown export later.
 */
export function ActivitySparkline({
  events,
  days = 7,
  height = 80,
}: ActivitySparklineProps) {
  const buckets = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const out: { date: string; library: number; vote: number; note: number; upload: number; total: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      out.push({
        date: d.toISOString().slice(0, 10),
        library: 0,
        vote: 0,
        note: 0,
        upload: 0,
        total: 0,
      });
    }
    const indexByDate = new Map(out.map((b, i) => [b.date, i]));
    for (const ev of events) {
      const dateKey = ev.at.slice(0, 10);
      const idx = indexByDate.get(dateKey);
      if (idx === undefined) continue;
      out[idx][ev.kind]++;
      out[idx].total++;
    }
    return out;
  }, [events, days]);

  const max = Math.max(1, ...buckets.map((b) => b.total));
  const W = 320;
  const padX = 8;
  const padY = 14;
  const innerW = W - padX * 2;
  const innerH = height - padY * 2;
  const colW = innerW / buckets.length;
  const barW = Math.max(8, colW - 6);

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Activity, last {days} days
        </h2>
        <span className="text-[11px] text-muted-foreground">
          peak {max} event{max === 1 ? "" : "s"}/day
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} className="mt-2 w-full" role="img" aria-label="Activity sparkline">
        {buckets.map((b, i) => {
          const x = padX + i * colW + (colW - barW) / 2;
          let yCursor = height - padY;
          const stack: { kind: "library" | "vote" | "note" | "upload"; count: number }[] = [
            { kind: "library", count: b.library },
            { kind: "vote", count: b.vote },
            { kind: "note", count: b.note },
            { kind: "upload", count: b.upload },
          ];
          const segs = stack.map((s) => {
            const segH = (s.count / max) * innerH;
            const segY = yCursor - segH;
            yCursor = segY;
            return { ...s, segY, segH };
          });
          return (
            <g key={b.date}>
              {segs.map(
                (s) =>
                  s.segH > 0 && (
                    <rect
                      key={s.kind}
                      x={x}
                      y={s.segY}
                      width={barW}
                      height={s.segH}
                      fill={KIND_COLORS[s.kind]}
                      opacity={0.9}
                    >
                      <title>{`${b.date} — ${s.kind}: ${s.count}`}</title>
                    </rect>
                  ),
              )}
              {b.total > 0 && (
                <text
                  x={x + barW / 2}
                  y={height - padY + 11}
                  fontSize="9"
                  textAnchor="middle"
                  fill="currentColor"
                  opacity={0.6}
                >
                  {b.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
        {(["library", "vote", "note", "upload"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: KIND_COLORS[k] }}
              aria-hidden
            />
            <span className="text-muted-foreground">{k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
