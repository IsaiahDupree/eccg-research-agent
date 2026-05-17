import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, FileQuestion, Search, ShieldCheck } from "lucide-react";
import { loadSeedPipeline } from "@/lib/seed";
import { NICHES, findNiche, matchesNiche } from "@/lib/niches";
import { categoryLabel, formatMonthsAgo } from "@/lib/utils";
import { Badge } from "@/components/Badge";
import { NicheCookieSetter } from "./NicheCookieSetter";
import gapsRaw from "@/fixtures/eccg_gaps.json" with { type: "json" };

export const dynamic = "force-static";

interface Gap {
  canonical_id: string;
  title: string | null;
  referenced_by_count: number;
  arxiv_id: string | null;
  authors: string[];
  abstract?: string | null;
}

export function generateStaticParams() {
  return NICHES.map((n) => ({ slug: n.slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const niche = findNiche(slug);
  if (niche.slug !== slug) return { title: "Niche not found" };
  return {
    title: niche.label,
    description: `${niche.label} — ${niche.description}`,
    keywords: niche.core_keywords,
    openGraph: {
      type: "website",
      title: `${niche.label} — ECCG Research Agent`,
      description: niche.description,
    },
    alternates: { canonical: `/n/${niche.slug}` },
  };
}

export default async function NichePage({ params }: Params) {
  const { slug } = await params;
  const niche = findNiche(slug);
  if (niche.slug !== slug) notFound();

  const result = loadSeedPipeline();
  const inNiche = result.scored.filter((s) =>
    matchesNiche(`${s.paper.title} ${s.paper.abstract}`, niche),
  );
  const topByScore = [...inNiche].sort((a, b) => b.total - a.total).slice(0, 10);
  const newest = [...inNiche]
    .sort((a, b) => a.paper.months_since_publish - b.paper.months_since_publish)
    .slice(0, 5);

  const categoryCounts = new Map<string, number>();
  for (const s of inNiche) {
    const cat = s.paper.eccg_category ?? "unclassified";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  const topCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const nicheGaps = (gapsRaw as Gap[]).filter((g) => {
    if (!g.title) return false;
    const text = `${g.title} ${g.abstract ?? ""}`.toLowerCase();
    return niche.core_keywords.some((k) => text.includes(k.toLowerCase()));
  });

  return (
    <>
      <NicheCookieSetter slug={niche.slug} />
      <section className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          niche
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {niche.label}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {niche.description}
        </p>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          arXiv categories polled: {niche.arxiv_categories.join(", ")} ·{" "}
          {niche.core_keywords.length} core keywords
        </p>
      </section>

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Papers in niche" value={inNiche.length} />
        <Stat
          label="Avg score"
          value={
            inNiche.length > 0
              ? (
                  inNiche.reduce((s, p) => s + p.total, 0) / inNiche.length
                ).toFixed(1)
              : "—"
          }
        />
        <Stat label="Sub-categories" value={categoryCounts.size} />
        <Stat label="Adjacent gaps" value={nicheGaps.length} />
      </dl>

      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        <Link
          href={`/?niche=${niche.slug}`}
          className="inline-flex items-center gap-1.5 rounded-md border bg-accent px-3 py-1.5 font-medium text-accent-foreground hover:bg-accent/90"
        >
          Open full ranking <ArrowRight className="h-3 w-3" />
        </Link>
        <Link
          href={`/review?niche=${niche.slug}`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 hover:bg-muted"
        >
          <ShieldCheck className="h-3 w-3" /> Review queue
        </Link>
        <Link
          href={`/gaps`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 hover:bg-muted"
        >
          <FileQuestion className="h-3 w-3" /> Gaps
        </Link>
        <Link
          href={`/leaderboard`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 hover:bg-muted"
        >
          Leaderboard
        </Link>
      </div>

      {topCategories.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium">Sub-categories</h2>
          <div className="flex flex-wrap gap-1.5">
            {topCategories.map(([slug, count]) => (
              <Link
                key={slug}
                href={`/?category=${slug}&niche=${niche.slug}`}
                className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-xs hover:bg-muted/80"
              >
                {categoryLabel(slug)}
                <span className="rounded-full bg-background px-1.5 text-[10px] tabular-nums">
                  {count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Top papers</h2>
        {topByScore.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No papers tagged for this niche yet. The daily cron polls these arXiv
            categories — check back tomorrow, or use{" "}
            <Link href="/upload" className="underline">/upload</Link> to seed it
            manually.
          </p>
        ) : (
          <ol className="rounded-lg border">
            {topByScore.map((s, i) => (
              <li
                key={s.paper.id}
                className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
              >
                <span className="tabular-nums text-xs text-muted-foreground">#{i + 1}</span>
                <div className="min-w-0">
                  <Link
                    href={`/paper/${encodeURIComponent(s.paper.id)}`}
                    className="line-clamp-1 font-medium hover:underline"
                  >
                    {s.paper.title}
                  </Link>
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {s.paper.authors.slice(0, 2).map((a) => a.name).join(", ")}
                    {s.paper.authors.length > 2 && ` +${s.paper.authors.length - 2}`}
                    {" · "}
                    {s.paper.venue?.name ?? "preprint"}
                    {" · "}
                    {formatMonthsAgo(s.paper.months_since_publish)}
                    {s.paper.eccg_category && (
                      <>
                        {" · "}
                        <span>{categoryLabel(s.paper.eccg_category)}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {s.total.toFixed(0)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {newest.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium">Most recent</h2>
          <ul className="space-y-1.5">
            {newest.map((s) => (
              <li key={s.paper.id} className="text-sm">
                <Link
                  href={`/paper/${encodeURIComponent(s.paper.id)}`}
                  className="hover:underline"
                >
                  {s.paper.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatMonthsAgo(s.paper.months_since_publish)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nicheGaps.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Search className="h-3.5 w-3.5" />
            Coverage gaps in this niche{" "}
            <span className="text-muted-foreground">({nicheGaps.length})</span>
          </h2>
          <ul className="space-y-1.5">
            {nicheGaps.slice(0, 5).map((g) => (
              <li
                key={g.canonical_id}
                className="flex flex-wrap items-baseline gap-2 text-sm"
              >
                <Badge variant="success" className="text-[10px]">
                  refs {g.referenced_by_count}
                </Badge>
                <span>{g.title}</span>
                {g.arxiv_id && (
                  <span className="text-xs text-muted-foreground">
                    arXiv:{g.arxiv_id}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {nicheGaps.length > 5 && (
            <p className="mt-2 text-xs text-muted-foreground">
              +{nicheGaps.length - 5} more gaps —{" "}
              <Link href="/gaps" className="underline">see all on /gaps</Link>.
            </p>
          )}
        </section>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Navigating to this page set <code className="rounded bg-muted px-1">{niche.slug}</code> as your active niche.
        It will persist across the site until you change it from the niche
        switcher in the header.
      </p>
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
