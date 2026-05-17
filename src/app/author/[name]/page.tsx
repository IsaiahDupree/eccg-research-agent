import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Users } from "lucide-react";
import { loadSeedPipeline } from "@/lib/seed";
import { PaperRow } from "@/components/PaperRow";

export const dynamicParams = true;

interface Params {
  params: Promise<{ name: string }>;
}

function normaliseName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
}

export async function generateStaticParams() {
  const result = loadSeedPipeline();
  const counts = new Map<string, number>();
  for (const s of result.scored) {
    for (const a of s.paper.authors) {
      counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
    }
  }
  // Pre-render the prolific authors at build time (5+ papers). Others
  // render on-demand thanks to `dynamicParams = true`. Names are returned
  // raw — Next.js handles URL encoding at link time. Returning
  // encodeURIComponent here double-encodes and 404s in production.
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 5)
    .map(([name]) => ({ name }));
}

export default async function AuthorPage({ params }: Params) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const result = loadSeedPipeline();
  const target = normaliseName(decoded);

  const papers = result.scored
    .filter((s) => s.paper.authors.some((a) => normaliseName(a.name) === target))
    .sort((a, b) => b.total - a.total);

  if (papers.length === 0) notFound();

  // Resolve display name from the first match (preserving original casing/accents)
  const display =
    papers[0]?.paper.authors.find((a) => normaliseName(a.name) === target)?.name ?? decoded;

  const venues = new Map<string, number>();
  const categories = new Map<string, number>();
  let totalCitations = 0;
  for (const s of papers) {
    const v = s.paper.venue?.name ?? "preprint";
    venues.set(v, (venues.get(v) ?? 0) + 1);
    const c = s.paper.eccg_category ?? "unclassified";
    categories.set(c, (categories.get(c) ?? 0) + 1);
    totalCitations += s.paper.citation_count;
  }
  const topVenues = Array.from(venues.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topCategories = Array.from(categories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const hIndexish = papers
    .map((s) => s.paper.citation_count)
    .sort((a, b) => b - a)
    .filter((c, i) => c >= i + 1).length;

  return (
    <>
      <section className="mb-6">
        <Link
          href="/"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to list
        </Link>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Users className="h-5 w-5" aria-hidden /> {display}
        </h1>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Papers in corpus" value={papers.length} />
          <Stat label="Citations (total)" value={totalCitations.toLocaleString()} />
          <Stat label="Corpus h-index" value={hIndexish} hint="from this corpus only" />
          <Stat
            label="Top venue"
            value={topVenues[0]?.[0] ?? "—"}
            hint={topVenues[0] ? `${topVenues[0][1]} papers` : undefined}
          />
        </dl>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Mini title="Venues">
          {topVenues.map(([v, c]) => (
            <li key={v} className="flex items-baseline justify-between text-xs">
              <span className="truncate">{v}</span>
              <span className="ml-2 tabular-nums text-muted-foreground">{c}</span>
            </li>
          ))}
        </Mini>
        <Mini title="ECCG categories">
          {topCategories.map(([c, n]) => (
            <li key={c} className="flex items-baseline justify-between text-xs">
              <Link
                href={`/?category=${encodeURIComponent(c)}`}
                className="truncate hover:underline"
              >
                {c}
              </Link>
              <span className="ml-2 tabular-nums text-muted-foreground">{n}</span>
            </li>
          ))}
        </Mini>
      </section>

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Papers
      </h2>
      <div className="rounded-lg border">
        {papers.map((s, i) => (
          <PaperRow key={s.paper.id} scored={s} rank={i + 1} />
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Scholar / Semantic Scholar profile lookup{" "}
        <a
          className="underline"
          href={`https://scholar.google.com/scholar?q=${encodeURIComponent(display)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          (search)
          <ExternalLink className="ml-0.5 inline h-3 w-3" />
        </a>
      </p>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Mini({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}
