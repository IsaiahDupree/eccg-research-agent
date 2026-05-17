import Link from "next/link";
import { ExternalLink, Github } from "lucide-react";
import { Badge } from "./Badge";
import { SaveButton } from "./SaveButton";
import { ScoreBar } from "./ScoreBar";
import { VoteWidget } from "./VoteWidget";
import type { ScoredPaper } from "@/lib/models";
import { categoryLabel, formatMonthsAgo } from "@/lib/utils";

interface PaperRowProps {
  scored: ScoredPaper;
  rank: number;
  /** When provided, replaces the rubric total in the score bar (e.g. community-adjusted). */
  displayScore?: number;
  /** Optional sub-label shown under the score bar (e.g. "hot 1.7"). */
  scoreSubLabel?: string;
}

export function PaperRow({ scored, rank, displayScore, scoreSubLabel }: PaperRowProps) {
  const { paper, total, repo } = scored;
  const detailHref = `/paper/${encodeURIComponent(paper.id)}`;
  const score = displayScore ?? total;
  return (
    <div className="group grid grid-cols-12 items-start gap-3 border-b border-border px-4 py-4 transition-colors hover:bg-muted/50">
      <div className="col-span-1 flex flex-col items-start gap-1 pt-0.5">
        <span className="text-xs tabular-nums text-muted-foreground">#{rank}</span>
        <VoteWidget paperId={paper.id} compact />
      </div>
      <div className="col-span-7 min-w-0">
        <Link
          href={detailHref}
          className="text-base font-medium leading-snug group-hover:underline"
        >
          {paper.title}
        </Link>
        <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {paper.abstract}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex flex-wrap items-center gap-x-1">
            {paper.authors.slice(0, 3).map((a, i) => (
              <span key={`${a.name}-${i}`}>
                <Link
                  href={`/author/${encodeURIComponent(a.name)}`}
                  className="hover:underline"
                >
                  {a.name}
                </Link>
                {i < Math.min(3, paper.authors.length) - 1 && ","}
              </span>
            ))}
            {paper.authors.length > 3 && (
              <span className="text-muted-foreground"> +{paper.authors.length - 3}</span>
            )}
          </span>
          <span aria-hidden>·</span>
          <span>{paper.venue?.name ?? "preprint"}</span>
          <span aria-hidden>·</span>
          <span>{formatMonthsAgo(paper.months_since_publish)}</span>
          {paper.eccg_category && (
            <>
              <span aria-hidden>·</span>
              <Badge variant="outline">{categoryLabel(paper.eccg_category)}</Badge>
            </>
          )}
        </div>
      </div>
      <div className="col-span-4 flex flex-col items-end gap-2">
        <div className="flex flex-col items-end gap-0.5">
          <ScoreBar value={score} />
          {scoreSubLabel && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {scoreSubLabel}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <SaveButton paperId={paper.id} />
          {paper.citation_count > 0 && (
            <Badge variant="muted">{paper.citation_count} citations</Badge>
          )}
          {repo && (
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-muted"
            >
              <Github className="h-3 w-3" /> {repo.stars}
            </a>
          )}
          {paper.html_url && (
            <a
              href={paper.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              arXiv <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
