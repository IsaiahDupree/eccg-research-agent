import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import gapsRaw from "@/fixtures/eccg_gaps.json" with { type: "json" };
import { Badge } from "@/components/Badge";

export const dynamic = "force-static";

interface Gap {
  canonical_id: string;
  s2_id: string | null;
  arxiv_id: string | null;
  doi: string | null;
  title: string | null;
  abstract: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  referenced_by_count: number;
  referenced_by: string[];
  html_url: string | null;
}

const gaps = gapsRaw as Gap[];

export default function GapsPage() {
  const arxivGaps = gaps.filter((g) => g.arxiv_id);
  const doiOnlyGaps = gaps.filter((g) => !g.arxiv_id && g.doi);
  const otherGaps = gaps.filter((g) => !g.arxiv_id && !g.doi);

  return (
    <>
      <section className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Search className="h-6 w-6" aria-hidden /> Coverage gaps
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Papers our top-200 corpus references that aren&apos;t yet in the
          corpus. Ranked by how often the corpus cites them — the higher up
          the list, the more likely they&apos;re foundational reading the
          ECCG community is missing. Built offline from Semantic Scholar
          reference data (<code>scripts/find-gaps.mjs</code>).
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total gaps" value={gaps.length} />
          <Stat label="With arXiv id" value={arxivGaps.length} hint="ingestable" />
          <Stat label="DOI-only" value={doiOnlyGaps.length} />
          <Stat label="S2-only" value={otherGaps.length} />
        </dl>
      </section>

      <ol className="space-y-2">
        {gaps.map((g, i) => (
          <li
            key={g.canonical_id}
            className="rounded-lg border bg-card p-4 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="font-medium">
                    {g.title ?? <em className="text-muted-foreground">(metadata unavailable)</em>}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {g.authors.slice(0, 3).join(", ")}
                  {g.authors.length > 3 && ` +${g.authors.length - 3}`}
                  {g.year && ` · ${g.year}`}
                  {g.venue && ` · ${g.venue}`}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="success">
                  refs {g.referenced_by_count}
                </Badge>
                {g.arxiv_id && (
                  <Badge variant="outline">arXiv:{g.arxiv_id}</Badge>
                )}
                {g.html_url && (
                  <a
                    href={g.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-muted"
                  >
                    open <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            {g.abstract && (
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {g.abstract}
              </p>
            )}
            {g.referenced_by.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                referenced by{" "}
                {g.referenced_by.slice(0, 5).map((id, j) => (
                  <span key={id}>
                    {j > 0 && ", "}
                    <Link
                      href={`/paper/${encodeURIComponent(id)}`}
                      className="underline hover:text-foreground"
                    >
                      {id}
                    </Link>
                  </span>
                ))}
                {g.referenced_by.length > 5 && (
                  <span> +{g.referenced_by.length - 5} more</span>
                )}
              </p>
            )}
          </li>
        ))}
      </ol>

      <p className="mt-6 text-xs text-muted-foreground">
        Rebuild this view by running{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          node scripts/find-gaps.mjs --top 200 --limit 200 --min-freq 2
        </code>
        . The script walks every top-N corpus paper&apos;s S2 references,
        intersects against our corpus, and tallies the misses.
      </p>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
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
