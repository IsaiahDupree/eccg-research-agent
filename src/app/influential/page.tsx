import Link from "next/link";
import { Award, Sparkles } from "lucide-react";
import { Badge } from "@/components/Badge";
import { ScoreBar } from "@/components/ScoreBar";
import { loadSeedPipeline } from "@/lib/seed";
import { getIntentCounts } from "@/lib/citations";
import { categoryLabel, formatMonthsAgo } from "@/lib/utils";

export const dynamic = "force-static";

interface Row {
  scored: ReturnType<typeof loadSeedPipeline>["scored"][number];
  total: number;
  background: number;
  methodology: number;
  result: number;
  extensionMethodology: number;
  replication: number;
}

export default function InfluentialPage() {
  const { scored } = loadSeedPipeline();

  const rows: Row[] = scored
    .map((s) => {
      const c = getIntentCounts(s.paper.id);
      return {
        scored: s,
        total: c.total,
        background: c.background,
        methodology: c.methodology,
        result: c.result,
        extensionMethodology: c.extensionMethodology,
        replication: c.replication,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => {
      // Default sort: total cited_by desc, tiebreak by replication strength
      if (b.total !== a.total) return b.total - a.total;
      return b.replication - a.replication;
    });

  const replicationTop = [...rows]
    .sort((a, b) => b.replication - a.replication || b.total - a.total)
    .slice(0, 10);

  const totals = rows.reduce(
    (acc, r) => ({
      cited: acc.cited + r.total,
      background: acc.background + r.background,
      methodology: acc.methodology + r.methodology,
      result: acc.result + r.result,
      ext: acc.ext + r.extensionMethodology,
    }),
    { cited: 0, background: 0, methodology: 0, result: 0, ext: 0 },
  );

  return (
    <>
      <section className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Award className="h-6 w-6" aria-hidden /> Most influential
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Ranked by in-corpus citation count. Built from the Semantic Scholar
          reference graph with citation-intent metadata — so we can separate{" "}
          <em>papers actually built on</em> (methodology / result /
          extension-methodology) from papers that just got named in the lit
          review (background).
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Papers cited" value={rows.length.toLocaleString()} />
          <Stat label="Total edges" value={totals.cited.toLocaleString()} />
          <Stat
            label="Replication-strength"
            value={(totals.methodology + totals.result + totals.ext).toLocaleString()}
            hint={`${totals.methodology} method · ${totals.result} result · ${totals.ext} extension`}
          />
          <Stat label="Background" value={totals.background.toLocaleString()} />
        </dl>
      </section>

      {replicationTop.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Top by replication-strength
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {replicationTop.map((r, i) => (
              <li
                key={r.scored.paper.id}
                className="rounded-md border bg-muted/30 p-3 text-sm"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="text-xs tabular-nums">
                    <span className="text-emerald-700 dark:text-emerald-400">
                      repl {r.replication}
                    </span>{" "}
                    <span className="text-muted-foreground">/ {r.total} total</span>
                  </span>
                </div>
                <Link
                  href={`/paper/${encodeURIComponent(r.scored.paper.id)}`}
                  className="mt-1 line-clamp-2 font-medium hover:underline"
                >
                  {r.scored.paper.title}
                </Link>
                {r.scored.paper.eccg_category && (
                  <Badge variant="outline" className="mt-2 inline-block">
                    {categoryLabel(r.scored.paper.eccg_category)}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        All influential papers ({rows.length.toLocaleString()})
      </h2>
      <div className="rounded-lg border">
        {rows.map((r, i) => {
          const p = r.scored.paper;
          return (
            <div
              key={p.id}
              className="grid grid-cols-12 items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="col-span-1 pt-0.5 text-xs tabular-nums text-muted-foreground">
                #{i + 1}
              </div>
              <div className="col-span-7 min-w-0">
                <Link
                  href={`/paper/${encodeURIComponent(p.id)}`}
                  className="line-clamp-2 font-medium hover:underline"
                >
                  {p.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {p.authors.slice(0, 3).map((a) => a.name).join(", ")}
                    {p.authors.length > 3 && ` +${p.authors.length - 3}`}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{p.venue?.name ?? "preprint"}</span>
                  <span aria-hidden>·</span>
                  <span>{formatMonthsAgo(p.months_since_publish)}</span>
                  {p.eccg_category && (
                    <>
                      <span aria-hidden>·</span>
                      <Badge variant="outline">{categoryLabel(p.eccg_category)}</Badge>
                    </>
                  )}
                </div>
              </div>
              <div className="col-span-4 flex flex-col items-end gap-1">
                <ScoreBar value={r.scored.total} />
                <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px] tabular-nums">
                  <Badge variant="muted">cited_by {r.total}</Badge>
                  {r.replication > 0 && (
                    <Badge variant="success">repl {r.replication}</Badge>
                  )}
                  {r.background > 0 && (
                    <span className="text-muted-foreground">bg {r.background}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Citation intents come from Semantic Scholar&apos;s reference-context
        classifier. <em>methodology</em> + <em>result</em> +{" "}
        <em>extensionMethodology</em> count as replication-strength.{" "}
        <em>background</em> is a citation in passing.
      </p>
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
