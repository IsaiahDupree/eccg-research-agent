import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, GitBranch, Users } from "lucide-react";
import { loadSeedPipeline } from "@/lib/seed";
import { PaperRow } from "@/components/PaperRow";
import { Badge } from "@/components/Badge";
import { getIntentCounts } from "@/lib/citations";
import { computeAuthorStats, normaliseAuthor as normaliseName } from "@/lib/author_stats";

export const dynamicParams = true;

interface Params {
  params: Promise<{ name: string }>;
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

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const result = loadSeedPipeline();
  const target = decoded.toLowerCase();
  const papers = result.scored.filter((s) =>
    s.paper.authors.some((a) => a.name.toLowerCase() === target),
  );
  if (papers.length === 0) return { title: `${decoded} — author not in corpus` };
  const totalCit = papers.reduce((s, p) => s + p.paper.citation_count, 0);
  const venues = Array.from(
    new Set(papers.map((p) => p.paper.venue?.name).filter(Boolean)),
  ).slice(0, 3);
  const description = `${decoded} — ${papers.length} papers in the ECCG corpus, ${totalCit.toLocaleString()} total citations. Active in ${venues.join(", ")}.`;
  return {
    title: decoded,
    description,
    openGraph: {
      type: "profile",
      title: `${decoded} — ECCG corpus`,
      description,
    },
    alternates: { canonical: `/author/${encodeURIComponent(decoded)}` },
  };
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

  const stats = computeAuthorStats(decoded, result.scored, getIntentCounts);
  const totalCitations = stats.citations_total;
  const totalInCorpusCitedBy = stats.in_corpus_cited_by;
  const totalReplication = stats.replication_total;
  const totalBackground = stats.background_total;
  const papersWithReplication = stats.papers_with_replication;
  const topVenues = stats.top_venues;
  const topCategories = stats.top_categories;
  const hIndexish = stats.h_index_proxy;
  const intentByPaper = stats.intent_by_paper;
  const topCollaborators = stats.top_collaborators;
  const mostReplicated = stats.most_replicated_paper_id
    ? {
        s: papers.find((s) => s.paper.id === stats.most_replicated_paper_id)!,
        ic: intentByPaper.get(stats.most_replicated_paper_id)!,
      }
    : null;

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
        {totalInCorpusCitedBy > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="In-corpus cited-by"
              value={totalInCorpusCitedBy.toLocaleString()}
              hint={`across ${papersWithReplication} replication-leading paper${papersWithReplication === 1 ? "" : "s"}`}
            />
            <Stat
              label="Replication-strength"
              value={totalReplication.toLocaleString()}
              hint="methodology + result + extension intent"
            />
            <Stat
              label="Background mentions"
              value={totalBackground.toLocaleString()}
              hint="lit-review citations"
            />
            {mostReplicated && (
              <Stat
                label="Most replicated"
                value={mostReplicated.ic.replication}
                hint={mostReplicated.s.paper.title.slice(0, 36) + "…"}
              />
            )}
          </dl>
        )}
        {mostReplicated && (
          <p className="mt-2 text-xs text-muted-foreground">
            Most-replicated work:{" "}
            <Link
              href={`/paper/${encodeURIComponent(mostReplicated.s.paper.id)}`}
              className="underline"
            >
              {mostReplicated.s.paper.title}
            </Link>{" "}
            — {mostReplicated.ic.replication} other corpus paper
            {mostReplicated.ic.replication === 1 ? "" : "s"} built on it.
          </p>
        )}
      </section>

      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <Mini title="Top collaborators">
          {topCollaborators.length === 0 ? (
            <li className="text-xs text-muted-foreground italic">
              No co-authors with ≥ 2 joint papers in corpus.
            </li>
          ) : (
            topCollaborators.map(([name, c]) => (
              <li key={name} className="flex items-baseline justify-between text-xs">
                <Link
                  href={`/author/${encodeURIComponent(name)}`}
                  className="truncate hover:underline"
                >
                  {name}
                </Link>
                <span className="ml-2 tabular-nums text-muted-foreground">{c}</span>
              </li>
            ))
          )}
        </Mini>
      </section>

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Papers
      </h2>
      <div className="rounded-lg border">
        {papers.map((s, i) => {
          const ic = intentByPaper.get(s.paper.id);
          return (
            <div key={s.paper.id}>
              <PaperRow scored={s} rank={i + 1} />
              {ic && ic.total > 0 && (
                <div className="-mt-2 ml-12 mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  in-corpus cited by <strong>{ic.total}</strong>
                  {ic.methodology > 0 && (
                    <Badge variant="success" className="text-[10px]">
                      {ic.methodology} methodology
                    </Badge>
                  )}
                  {ic.result > 0 && (
                    <Badge variant="success" className="text-[10px]">
                      {ic.result} result
                    </Badge>
                  )}
                  {ic.extensionMethodology > 0 && (
                    <Badge variant="success" className="text-[10px]">
                      {ic.extensionMethodology} extension
                    </Badge>
                  )}
                  {ic.background > 0 && (
                    <Badge variant="muted" className="text-[10px]">
                      {ic.background} background
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
