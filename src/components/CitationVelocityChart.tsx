import { TrendingUp } from "lucide-react";
import type { Paper } from "@/lib/models";

interface Props {
  paper: Paper;
  /** Median citations-per-month across the corpus, for baseline comparison. */
  corpusMedianCpm: number;
  /** Median CPM across this paper's venue (when ≥ 3 papers in that venue). */
  venueMedianCpm?: number;
}

/**
 * Citation velocity vs context.
 *
 * We don't have per-month time-series citation data — Semantic Scholar
 * gives us a single citation_count snapshot. What we *can* show is the
 * paper's cumulative trajectory (a straight line at the average rate)
 * plotted against two reference lines: the corpus median and the venue
 * median. Slope difference tells the story: a paper above both baselines
 * is "punching above its venue", below both is "ageing out".
 */
export function CitationVelocityChart({ paper, corpusMedianCpm, venueMedianCpm }: Props) {
  const months = Math.max(1, paper.months_since_publish);
  const cpm = paper.citation_count / months;

  const baselines = [
    { name: "this paper", cpm, color: "var(--accent)", weight: 3 },
    {
      name: "venue median",
      cpm: venueMedianCpm ?? 0,
      color: "currentColor",
      weight: 1.2,
      dashed: !!venueMedianCpm,
    },
    {
      name: "corpus median",
      cpm: corpusMedianCpm,
      color: "currentColor",
      weight: 1,
      opacity: 0.35,
    },
  ].filter((b) => b.cpm > 0 || b.name === "this paper");

  const maxY = Math.max(
    paper.citation_count,
    cpm * months,
    (venueMedianCpm ?? 0) * months,
    corpusMedianCpm * months,
    1,
  );
  const W = 480;
  const H = 140;
  const pad = { l: 32, r: 16, t: 10, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const xFor = (m: number) => pad.l + (m / months) * innerW;
  const yFor = (c: number) => pad.t + innerH - (c / maxY) * innerH;

  return (
    <section className="mt-6 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-medium">
        <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
        Citation velocity
        <span className="ml-1 text-xs text-muted-foreground">
          {cpm.toFixed(1)} cites/month over {months.toFixed(1)} months
        </span>
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Cumulative citations over the paper&apos;s lifetime, plotted at the
        average rate. The dashed line is the median citations/month for this
        venue, the dimmer line is the corpus median.
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-auto w-full text-muted-foreground"
        role="img"
        aria-label="Citation velocity chart"
      >
        {/* y-axis */}
        <line
          x1={pad.l}
          x2={pad.l}
          y1={pad.t}
          y2={pad.t + innerH}
          stroke="currentColor"
          strokeOpacity={0.4}
        />
        <line
          x1={pad.l}
          x2={pad.l + innerW}
          y1={pad.t + innerH}
          y2={pad.t + innerH}
          stroke="currentColor"
          strokeOpacity={0.4}
        />
        {/* y-axis labels */}
        <text x={pad.l - 6} y={pad.t + 4} fontSize={10} textAnchor="end" fill="currentColor">
          {Math.round(maxY)}
        </text>
        <text x={pad.l - 6} y={pad.t + innerH} fontSize={10} textAnchor="end" fill="currentColor">
          0
        </text>
        {/* x-axis labels */}
        <text x={pad.l} y={H - 6} fontSize={10} fill="currentColor">
          publish
        </text>
        <text
          x={pad.l + innerW}
          y={H - 6}
          fontSize={10}
          textAnchor="end"
          fill="currentColor"
        >
          now ({months.toFixed(0)} mo)
        </text>
        {/* baseline lines */}
        {baselines.map((b) => {
          const endY = yFor(b.cpm * months);
          return (
            <line
              key={b.name}
              x1={xFor(0)}
              y1={yFor(0)}
              x2={xFor(months)}
              y2={endY}
              stroke={b.color}
              strokeWidth={b.weight}
              strokeOpacity={b.opacity ?? 1}
              strokeDasharray={b.dashed ? "4 3" : undefined}
            />
          );
        })}
        {/* current-point marker */}
        <circle
          cx={xFor(months)}
          cy={yFor(paper.citation_count)}
          r={4}
          fill="var(--accent)"
        />
        <text
          x={xFor(months) - 6}
          y={yFor(paper.citation_count) - 6}
          fontSize={10}
          textAnchor="end"
          fill="currentColor"
          className="text-foreground"
        >
          {paper.citation_count} cit
        </text>
      </svg>
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <li className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-0.5 w-3"
            style={{ background: "var(--accent)" }}
          />
          this paper · {cpm.toFixed(2)} cpm
        </li>
        {venueMedianCpm !== undefined && (
          <li className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 border-t-2 border-dashed"
              style={{ borderColor: "currentColor" }}
            />
            {paper.venue?.name ?? "venue"} median · {venueMedianCpm.toFixed(2)} cpm
          </li>
        )}
        <li className="inline-flex items-center gap-1 opacity-70">
          <span aria-hidden className="inline-block h-0.5 w-3 bg-current" />
          corpus median · {corpusMedianCpm.toFixed(2)} cpm
        </li>
      </ul>
    </section>
  );
}
