import { Suspense } from "react";
import { loadSeedPipeline } from "@/lib/seed";
import { PaperList } from "@/components/PaperList";

export const dynamic = "force-static";

export default function HomePage() {
  const result = loadSeedPipeline();
  const topVelocity = [...result.raw.velocities].sort(
    (a, b) => b.multiplier - a.multiplier,
  )[0];
  return (
    <>
      <section className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Event-camera research, ranked.
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A continuously-updated digest of the latest event-based-vision papers.
          Pulled from arXiv, hydrated with Semantic Scholar citation data,
          scored by a transparent rubric, and summarized for the ECCG community.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Papers tracked" value={result.scored.length} />
          <Stat
            label="Avg score"
            value={(
              result.scored.reduce((s, p) => s + p.total, 0) /
              Math.max(1, result.scored.length)
            ).toFixed(1)}
          />
          <Stat
            label="Top velocity"
            value={
              topVelocity ? `${topVelocity.multiplier.toFixed(1)}×` : "—"
            }
            hint="vs venue baseline"
          />
          <Stat
            label="Categories"
            value={
              new Set(
                result.raw.papers
                  .map((p) => p.eccg_category)
                  .filter(Boolean),
              ).size
            }
          />
        </dl>
      </section>
      <Suspense fallback={null}>
        <PaperList scored={result.scored} />
      </Suspense>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
