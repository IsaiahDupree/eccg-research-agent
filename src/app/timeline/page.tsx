import { loadSeedPipeline } from "@/lib/seed";

export const dynamic = "force-static";

/**
 * Stacked bar by venue × month, mirroring the Neuro_Vision_Map bar.html
 * pattern (publications grouped by venue, faceted over time).
 */
export default function TimelinePage() {
  const result = loadSeedPipeline();

  // Bucket by month, then count per venue.
  const buckets = new Map<string, Map<string, number>>();
  for (const s of result.scored) {
    const d = new Date(s.paper.published_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(key)) buckets.set(key, new Map());
    const venue = s.paper.venue?.name ?? "preprint";
    buckets.get(key)!.set(venue, (buckets.get(key)!.get(venue) ?? 0) + 1);
  }
  const sortedKeys = Array.from(buckets.keys()).sort();
  const allVenues = Array.from(
    new Set(result.scored.map((s) => s.paper.venue?.name ?? "preprint")),
  ).sort();
  const maxBucketTotal = Math.max(
    1,
    ...Array.from(buckets.values()).map((m) =>
      Array.from(m.values()).reduce((s, v) => s + v, 0),
    ),
  );

  // Venue counts overall, sorted desc — for the legend/key + top-line stats.
  const venueTotals = new Map<string, number>();
  for (const m of buckets.values()) {
    for (const [v, c] of m) venueTotals.set(v, (venueTotals.get(v) ?? 0) + c);
  }
  const venueSorted = Array.from(venueTotals.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Publication timeline</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Stacked monthly publication counts by venue. Mirrors the bar view at{" "}
          <a
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
            href="https://hylz-2019.github.io/Neuro_Vision_Map/bar.html"
          >
            Neuro_Vision_Map/bar.html
          </a>
          . As the corpus grows beyond the demo fixture, the picture per venue
          becomes much sharper.
        </p>
      </section>

      <div className="rounded-lg border p-6">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
          {sortedKeys.map((k) => {
            const bucket = buckets.get(k)!;
            const total = Array.from(bucket.values()).reduce((s, v) => s + v, 0);
            return (
              <div key={k} className="contents">
                <div className="self-center text-xs tabular-nums text-muted-foreground">
                  {k}
                </div>
                <div className="flex h-7 w-full overflow-hidden rounded-md bg-muted">
                  {allVenues.map((v) => {
                    const count = bucket.get(v) ?? 0;
                    if (count === 0) return null;
                    return (
                      <div
                        key={v}
                        title={`${v}: ${count}`}
                        style={{
                          width: `${(count / maxBucketTotal) * 100}%`,
                          background: colorFor(v),
                        }}
                      />
                    );
                  })}
                </div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  {total}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-xs">
          {venueSorted.map(([v, c]) => (
            <span key={v} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: colorFor(v) }}
              />
              {v}{" "}
              <span className="text-muted-foreground">({c})</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

// Stable colour per venue: hash-based palette so adding a venue does not
// reshuffle every other colour.
const PALETTE = [
  "#6366f1", "#f97316", "#0ea5e9", "#22c55e", "#a855f7", "#eab308",
  "#06b6d4", "#ef4444", "#14b8a6", "#84cc16", "#f43f5e", "#8b5cf6",
  "#0891b2", "#d946ef", "#64748b", "#3b82f6", "#ec4899", "#22d3ee",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorFor(venue: string): string {
  return PALETTE[hash(venue) % PALETTE.length];
}
