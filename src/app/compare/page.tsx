import Link from "next/link";
import { ExternalLink, GitCompareArrows, X } from "lucide-react";
import { loadSeedPipeline } from "@/lib/seed";
import { getNeighbors } from "@/lib/similarity";
import { Badge } from "@/components/Badge";
import { ScoreBar } from "@/components/ScoreBar";
import { categoryLabel, formatMonthsAgo } from "@/lib/utils";
import type { ScoredPaper } from "@/lib/models";

export const dynamic = "force-static";

interface CompareProps {
  searchParams: Promise<{ ids?: string }>;
}

function parseIds(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
}

export default async function ComparePage({ searchParams }: CompareProps) {
  const { ids } = await searchParams;
  const wantedIds = parseIds(ids);
  const { scored } = loadSeedPipeline();
  const byId = new Map(scored.map((s) => [s.paper.id, s]));

  const picked: ScoredPaper[] = wantedIds
    .map((id) => byId.get(id))
    .filter((s): s is ScoredPaper => s !== undefined);

  const suggestionPool = new Map<string, { score: number; reason: string }>();
  for (const p of picked) {
    for (const n of getNeighbors(p.paper.id, 5)) {
      if (picked.some((x) => x.paper.id === n.id)) continue;
      const prev = suggestionPool.get(n.id);
      if (!prev || prev.score < n.sim) {
        suggestionPool.set(n.id, {
          score: n.sim,
          reason: `${(n.sim * 100).toFixed(0)}% similar to ${p.paper.title.slice(0, 40)}…`,
        });
      }
    }
  }
  const suggestions = Array.from(suggestionPool.entries())
    .map(([id, info]) => ({
      scored: byId.get(id),
      ...info,
    }))
    .filter((x) => x.scored)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // Union of category contributors so the per-axis rows align between columns
  const axisNames = picked[0]?.categories.map((c) => c.name) ?? [];

  function buildLink(replaceIds: string[]): string {
    const trimmed = replaceIds.filter(Boolean);
    return trimmed.length ? `/compare?ids=${trimmed.join(",")}` : "/compare";
  }

  return (
    <>
      <section className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <GitCompareArrows className="h-6 w-6" aria-hidden /> Compare
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Side-by-side score breakdown for up to 5 papers. Pulls in similar
          papers from the corpus via the TF-IDF similarity engine so you can
          see <em>where they agree, where they differ</em> — the gap Rick called
          out about NotebookLM &amp; Co.
        </p>
      </section>

      {picked.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 px-6 py-10 text-center text-sm">
          <p>No papers selected yet.</p>
          <p className="mt-2 text-muted-foreground">
            Start from any paper page and click <em>Compare related</em>, or
            visit{" "}
            <code className="rounded bg-background px-1.5 py-0.5">
              /compare?ids=arxiv-2402.18221,arxiv-2401.02410
            </code>
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 border-b py-2 pr-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  Field
                </th>
                {picked.map((p, idx) => (
                  <th
                    key={p.paper.id}
                    className="w-1/5 border-b border-l py-2 pl-3 pr-3 align-top text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/paper/${encodeURIComponent(p.paper.id)}`}
                        className="line-clamp-3 text-sm font-semibold leading-snug hover:underline"
                      >
                        {p.paper.title}
                      </Link>
                      <Link
                        href={buildLink(picked.filter((_, i) => i !== idx).map((x) => x.paper.id))}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="Remove from compare"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-3 align-top text-xs uppercase tracking-wide text-muted-foreground">
                  Score
                </td>
                {picked.map((p) => (
                  <td key={p.paper.id} className="border-l py-2 pl-3 pr-3 align-top">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-semibold tabular-nums">
                        {p.total.toFixed(0)}
                      </span>
                      <ScoreBar value={p.total} label={false} />
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 align-top text-xs uppercase tracking-wide text-muted-foreground">
                  Category
                </td>
                {picked.map((p) => (
                  <td key={p.paper.id} className="border-l py-2 pl-3 pr-3 align-top">
                    {p.paper.eccg_category && (
                      <Badge variant="outline">{categoryLabel(p.paper.eccg_category)}</Badge>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 align-top text-xs uppercase tracking-wide text-muted-foreground">
                  Venue
                </td>
                {picked.map((p) => (
                  <td key={p.paper.id} className="border-l py-2 pl-3 pr-3 align-top text-xs text-muted-foreground">
                    {p.paper.venue?.name ?? "—"} · {formatMonthsAgo(p.paper.months_since_publish)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 align-top text-xs uppercase tracking-wide text-muted-foreground">
                  Authors
                </td>
                {picked.map((p) => (
                  <td
                    key={p.paper.id}
                    className="border-l py-2 pl-3 pr-3 align-top text-xs"
                  >
                    {p.paper.authors.slice(0, 3).map((a) => a.name).join(", ")}
                    {p.paper.authors.length > 3 && ` +${p.paper.authors.length - 3}`}
                  </td>
                ))}
              </tr>
              {axisNames.map((name) => (
                <tr key={name}>
                  <td className="py-1.5 pr-3 align-top text-xs uppercase tracking-wide text-muted-foreground">
                    {name.replace(/_/g, " ")}
                  </td>
                  {picked.map((p) => {
                    const c = p.categories.find((x) => x.name === name);
                    if (!c)
                      return <td key={p.paper.id} className="border-l py-1.5 pl-3 pr-3 align-top">—</td>;
                    return (
                      <td
                        key={p.paper.id}
                        className="border-l py-1.5 pl-3 pr-3 align-top"
                      >
                        <div className="flex items-center gap-2">
                          <ScoreBar value={(c.raw * 10)} label={false} />
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {((c.raw * c.weight) / 10).toFixed(1)}/{c.weight}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {c.rationale}
                        </p>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-3 align-top text-xs uppercase tracking-wide text-muted-foreground">
                  Abstract
                </td>
                {picked.map((p) => (
                  <td
                    key={p.paper.id}
                    className="border-l py-2 pl-3 pr-3 align-top text-xs leading-relaxed text-muted-foreground"
                  >
                    <p className="line-clamp-[8]">{p.paper.abstract}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.paper.html_url && (
                        <a
                          href={p.paper.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-foreground hover:underline"
                        >
                          arXiv <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <Link
                        href={`/paper/${encodeURIComponent(p.paper.id)}`}
                        className="text-accent hover:underline"
                      >
                        Open full digest →
                      </Link>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {suggestions.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Add a similar paper
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.scored!.paper.id}>
                <Link
                  href={buildLink([...picked.map((p) => p.paper.id), s.scored!.paper.id])}
                  className="block rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40"
                >
                  <div className="line-clamp-2 font-medium">{s.scored!.paper.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    score {s.scored!.total.toFixed(0)} · {s.reason}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
