import Link from "next/link";
import { loadSeedPipeline } from "@/lib/seed";
import { TAXONOMY } from "@/lib/taxonomy";
import { categoryLabel } from "@/lib/utils";

export const dynamic = "force-static";

export default function CategoriesPage() {
  const result = loadSeedPipeline();
  const countBySlug = new Map<string, number>();
  for (const s of result.scored) {
    const slug = s.paper.eccg_category ?? "unclassified";
    countBySlug.set(slug, (countBySlug.get(slug) ?? 0) + 1);
  }
  // sort taxonomy by count descending, then alpha
  const rows = TAXONOMY.map((cat) => ({
    ...cat,
    count: countBySlug.get(cat.slug) ?? 0,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const total = result.scored.length;
  const totalKeywords = TAXONOMY.reduce((s, c) => s + c.keywords.length, 0);

  return (
    <>
      <section className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The 17 ECCG sub-areas, distilled from{" "}
          <a
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
            href="https://github.com/uzh-rpg/event-based_vision_resources"
          >
            uzh-rpg/event-based_vision_resources
          </a>
          . Each card opens the filtered list view. Keywords power the
          relevance scorer.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Categories" value={TAXONOMY.length} />
          <Stat label="Papers in corpus" value={total} />
          <Stat label="Keyword anchors" value={totalKeywords} />
          <Stat label="Unclassified" value={countBySlug.get("unclassified") ?? 0} />
        </dl>
      </section>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/?category=${encodeURIComponent(r.slug)}`}
              className="group flex h-full flex-col justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-medium leading-tight group-hover:underline">
                    {r.label}
                  </h2>
                  <span className="tabular-nums text-sm text-muted-foreground">
                    {r.count}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Keyword anchors:{" "}
                  <span className="text-foreground">
                    {r.keywords.slice(0, 4).join(", ")}
                    {r.keywords.length > 4 ? "…" : ""}
                  </span>
                </p>
              </div>
              <div className="mt-3 text-xs text-accent">View matched papers →</div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
