import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, GitCompareArrows, Github } from "lucide-react";
import { loadSeedPipeline } from "@/lib/seed";
import { Badge } from "@/components/Badge";
import { ScoreBar } from "@/components/ScoreBar";
import { categoryLabel, formatMonthsAgo } from "@/lib/utils";
import { fixtureDigest } from "@/lib/llm/provider";
import { getNeighbors } from "@/lib/similarity";
import { NotesPanel } from "@/components/NotesPanel";
import { VoteWidget } from "@/components/VoteWidget";
import { CompareWithLibraryButton } from "@/components/CompareWithLibraryButton";
import { getCitationEdges, getIntentCounts } from "@/lib/citations";
import { getMeetingMentionsFor } from "@/lib/meeting_mentions";
import { Mic } from "lucide-react";

export const dynamicParams = true;

export async function generateStaticParams() {
  // Return raw ids — Next.js will URL-encode them when building paths.
  // Double-encoding here causes a %3A → %253A mismatch on production routes.
  const result = loadSeedPipeline();
  return result.scored.map((s) => ({ id: s.paper.id }));
}

interface Params {
  params: Promise<{ id: string }>;
}

export default async function PaperPage({ params }: Params) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const result = loadSeedPipeline();
  const scored = result.scored.find((s) => s.paper.id === decoded);
  if (!scored) notFound();

  const digest =
    result.digests.find((d) => d.scored.paper.id === decoded) ?? fixtureDigest(scored);

  // Prefer similarity-engine neighbours; fall back to same-category papers.
  const neighborIds = getNeighbors(scored.paper.id, 4).map((n) => n.id);
  const byId = new Map(result.scored.map((s) => [s.paper.id, s]));
  let related = neighborIds
    .map((id) => byId.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (related.length < 4) {
    const cat = scored.paper.eccg_category;
    const extras = result.scored.filter(
      (s) =>
        s.paper.id !== scored.paper.id &&
        s.paper.eccg_category === cat &&
        !neighborIds.includes(s.paper.id),
    );
    related = [...related, ...extras].slice(0, 4);
  }

  // In-corpus citation graph (edges now carry intent metadata)
  const edges = getCitationEdges(scored.paper.id);
  const cites = edges.cites
    .map((e) => ({ s: byId.get(e.id), intents: e.intents }))
    .filter((row): row is { s: NonNullable<typeof row.s>; intents: typeof row.intents } => Boolean(row.s))
    .sort((a, b) => b.s.total - a.s.total);
  const citedBy = edges.cited_by
    .map((e) => ({ s: byId.get(e.id), intents: e.intents }))
    .filter((row): row is { s: NonNullable<typeof row.s>; intents: typeof row.intents } => Boolean(row.s))
    .sort((a, b) => {
      const ra = a.intents.some((i) => i === "methodology" || i === "result" || i === "extensionMethodology") ? 1 : 0;
      const rb = b.intents.some((i) => i === "methodology" || i === "result" || i === "extensionMethodology") ? 1 : 0;
      if (ra !== rb) return rb - ra;
      return b.s.total - a.s.total;
    });

  return (
    <article className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <Link
          href="/"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to list
        </Link>
        <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">
          {scored.paper.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex flex-wrap items-center gap-x-1">
            {scored.paper.authors.map((a, i) => (
              <span key={`${a.name}-${i}`}>
                <Link
                  href={`/author/${encodeURIComponent(a.name)}`}
                  className="hover:underline"
                >
                  {a.name}
                </Link>
                {i < scored.paper.authors.length - 1 && ","}
              </span>
            ))}
          </span>
          <span aria-hidden>·</span>
          <span>{scored.paper.venue?.name ?? "arXiv preprint"}</span>
          <span aria-hidden>·</span>
          <span>{formatMonthsAgo(scored.paper.months_since_publish)}</span>
          {scored.paper.eccg_category && (
            <Badge variant="outline">{categoryLabel(scored.paper.eccg_category)}</Badge>
          )}
          <VoteWidget paperId={scored.paper.id} showReason />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {related.length > 0 && (
            <Link
              href={`/compare?ids=${encodeURIComponent(
                [scored.paper.id, ...related.slice(0, 2).map((r) => r.paper.id)].join(","),
              )}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <GitCompareArrows className="h-4 w-4" /> Compare with related
            </Link>
          )}
          <CompareWithLibraryButton currentPaperId={scored.paper.id} />
          {scored.paper.html_url && (
            <a
              href={scored.paper.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <FileText className="h-4 w-4" /> arXiv abstract <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {scored.paper.pdf_url && (
            <a
              href={scored.paper.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              PDF <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {scored.repo && (
            <a
              href={scored.repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Github className="h-4 w-4" /> {scored.repo.full_name} ⭐{scored.repo.stars}
            </a>
          )}
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-medium">TL;DR</h2>
          <p className="mt-2 text-base">{digest.tldr}</p>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-medium">Key contributions</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {digest.key_contributions.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-medium">Why this matters to ECCG</h2>
          <p className="mt-2 text-sm leading-relaxed">{digest.eccg_relevance}</p>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-medium">Relation to prior work</h2>
          <p className="mt-2 text-sm leading-relaxed">{digest.relation_to_prior_work}</p>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-medium">Open questions</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {digest.open_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-medium">Abstract</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {scored.paper.abstract}
          </p>
        </section>

        {(cites.length > 0 || citedBy.length > 0) && (
          <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cites.length > 0 && (
              <div className="rounded-lg border p-4">
                <h3 className="text-sm font-medium">
                  Cites in corpus{" "}
                  <span className="text-muted-foreground">({cites.length})</span>
                </h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Papers this one explicitly references that are also in the ECCG corpus.
                </p>
                <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1 text-sm">
                  {cites.map((c) => (
                    <li key={c.s.paper.id}>
                      <Link
                        href={`/paper/${encodeURIComponent(c.s.paper.id)}`}
                        className="line-clamp-2 hover:underline"
                      >
                        {c.s.paper.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span>score {c.s.total.toFixed(0)} · {c.s.paper.citation_count} citations</span>
                        {c.intents.map((i) => (
                          <Badge
                            key={i}
                            variant={
                              i === "methodology" || i === "result" || i === "extensionMethodology"
                                ? "success"
                                : "muted"
                            }
                            className="ml-1"
                          >
                            {i}
                          </Badge>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {citedBy.length > 0 &&
              (() => {
                const ic = getIntentCounts(scored.paper.id);
                return (
                  <div className="rounded-lg border p-4">
                    <h3 className="text-sm font-medium">
                      Cited by{" "}
                      <span className="text-muted-foreground">({citedBy.length})</span>
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      Of {ic.total} corpus citations:
                      {ic.methodology > 0 && (
                        <Badge variant="success" className="ml-1">
                          {ic.methodology} methodology
                        </Badge>
                      )}
                      {ic.result > 0 && (
                        <Badge variant="success">
                          {ic.result} result
                        </Badge>
                      )}
                      {ic.extensionMethodology > 0 && (
                        <Badge variant="success">
                          {ic.extensionMethodology} extension
                        </Badge>
                      )}
                      {ic.background > 0 && (
                        <Badge variant="muted">
                          {ic.background} background
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Green = built on this work (methodology / result / extension).
                      Gray = named in background.
                    </p>
                    <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1 text-sm">
                      {citedBy.map((c) => (
                        <li key={c.s.paper.id}>
                          <Link
                            href={`/paper/${encodeURIComponent(c.s.paper.id)}`}
                            className="line-clamp-2 hover:underline"
                          >
                            {c.s.paper.title}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            <span>
                              score {c.s.total.toFixed(0)} ·{" "}
                              {formatMonthsAgo(c.s.paper.months_since_publish)}
                            </span>
                            {c.intents.map((i) => (
                              <Badge
                                key={i}
                                variant={
                                  i === "methodology" || i === "result" || i === "extensionMethodology"
                                    ? "success"
                                    : "muted"
                                }
                                className="ml-1"
                              >
                                {i}
                              </Badge>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
          </section>
        )}

        {(() => {
          const mentions = getMeetingMentionsFor(scored.paper.id);
          if (mentions.length === 0) return null;
          return (
            <section className="mt-8 rounded-lg border bg-card p-4">
              <h2 className="flex items-center gap-2 text-base font-medium">
                <Mic className="h-4 w-4 text-muted-foreground" aria-hidden />
                Discussed in meetings ({mentions.length})
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Live transcripts where this paper came up — read the surrounding
                excerpt before quoting, since the lexical extractor matches by
                title prefix and arXiv id.
              </p>
              <ul className="mt-3 space-y-3 text-sm">
                {mentions.map((m, i) => (
                  <li
                    key={`${m.meeting_id}-${i}`}
                    className="border-l-2 border-muted pl-3"
                  >
                    <Link
                      href={`/meetings/${m.meeting_id}`}
                      className="font-medium hover:underline"
                    >
                      {m.meeting_title}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(m.held_at).toLocaleDateString()}
                    </span>
                    <p className="mt-1 line-clamp-3 text-muted-foreground">
                      …{m.excerpt.trim()}…
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}

        <NotesPanel paperId={scored.paper.id} />

        <p className="mt-8 text-xs text-muted-foreground">
          Digest generated by <code className="rounded bg-muted px-1.5 py-0.5">{digest.model}</code>.
          Read the paper before citing — digests are a decision aid, not a substitute.
        </p>
      </div>

      <aside className="space-y-5">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Score</h3>
            <span className="text-2xl font-semibold tabular-nums">
              {scored.total.toFixed(0)}
            </span>
          </div>
          <ScoreBar value={scored.total} className="mt-2" label={false} />
          <div className="mt-4 space-y-2 text-xs">
            {scored.categories.map((c) => (
              <div key={c.name} className="grid grid-cols-[1fr_auto] gap-x-2">
                <div className="truncate">
                  <div className="text-foreground">{c.name.replace(/_/g, " ")}</div>
                  <div className="text-muted-foreground">{c.rationale}</div>
                </div>
                <div className="tabular-nums text-muted-foreground">
                  {((c.raw * c.weight) / 10).toFixed(1)} / {c.weight}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Predicted audience</h3>
          <p className="mt-1 text-sm text-muted-foreground">{digest.predicted_audience}</p>
        </div>

        {related.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium">Related in this category</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {related.map((r) => (
                <li key={r.paper.id}>
                  <Link
                    href={`/paper/${encodeURIComponent(r.paper.id)}`}
                    className="line-clamp-2 hover:underline"
                  >
                    {r.paper.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    score {r.total.toFixed(0)} ·{" "}
                    {r.paper.citation_count} cit ·{" "}
                    {formatMonthsAgo(r.paper.months_since_publish)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </article>
  );
}
