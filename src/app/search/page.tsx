"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, FileText, Mic, Search as SearchIcon } from "lucide-react";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { loadSeedPipelineClient } from "@/lib/seed_client";
import { useLibrary } from "@/lib/library_client";
import { formatMonthsAgo } from "@/lib/utils";
import type { ScoredPaper } from "@/lib/models";

// Bundled meetings + their digests so we can grep across transcripts and
// extracted paper mentions client-side. Same source the /meetings page reads.
import meetingsRaw from "@/fixtures/seed_meetings.json" with { type: "json" };

interface MeetingFixture {
  id: string;
  title: string;
  held_at: string;
  transcript: string;
  attendees: { name: string }[];
}

interface PaperHit {
  kind: "paper";
  paper: ScoredPaper;
  matched_in: "title" | "abstract" | "author" | "category";
}

interface MeetingHit {
  kind: "meeting";
  id: string;
  title: string;
  held_at: string;
  excerpt: string;
}

interface LibraryHit {
  kind: "library";
  paper: ScoredPaper;
  added_by: string;
}

type AnyHit = PaperHit | MeetingHit | LibraryHit;

const MAX_PER_GROUP = 25;

function rankPaper(
  paper: ScoredPaper,
  q: string,
): { matched: PaperHit["matched_in"]; score: number } | null {
  const t = paper.paper.title.toLowerCase();
  const a = paper.paper.abstract.toLowerCase();
  const auth = paper.paper.authors.map((x) => x.name.toLowerCase()).join(" ");
  const cat = (paper.paper.eccg_category ?? "").toLowerCase();
  const query = q.toLowerCase();
  if (t.includes(query)) return { matched: "title", score: 100 + paper.total };
  if (auth.includes(query)) return { matched: "author", score: 60 + paper.total };
  if (cat.includes(query)) return { matched: "category", score: 40 + paper.total };
  if (a.includes(query)) return { matched: "abstract", score: 20 + paper.total };
  return null;
}

function excerptAround(text: string, query: string, span = 160): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, span);
  const start = Math.max(0, idx - Math.floor(span / 2));
  const end = Math.min(text.length, start + span);
  let s = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "…" + s;
  if (end < text.length) s = s + "…";
  return s;
}

function SearchInner() {
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [scored, setScored] = useState<ScoredPaper[]>([]);
  const { items: libraryItems } = useLibrary();

  useEffect(() => {
    setScored(loadSeedPipelineClient().scored);
  }, []);

  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  // Push the live query into the URL (debounced) so search results are
  // shareable.
  useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      if (q) url.searchParams.set("q", q);
      else url.searchParams.delete("q");
      window.history.replaceState(null, "", url.toString());
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const trimmed = q.trim();

  const { papers, meetings, library } = useMemo<{
    papers: PaperHit[];
    meetings: MeetingHit[];
    library: LibraryHit[];
  }>(() => {
    if (trimmed.length < 2) {
      return { papers: [], meetings: [], library: [] };
    }
    const pp: PaperHit[] = [];
    for (const s of scored) {
      const r = rankPaper(s, trimmed);
      if (r) pp.push({ kind: "paper", paper: s, matched_in: r.matched });
    }
    pp.sort((a, b) => {
      const ra = rankPaper(a.paper, trimmed)!;
      const rb = rankPaper(b.paper, trimmed)!;
      return rb.score - ra.score;
    });

    const mm: MeetingHit[] = [];
    const queryLower = trimmed.toLowerCase();
    for (const m of meetingsRaw as MeetingFixture[]) {
      const haystack = `${m.title}\n${m.transcript}\n${m.attendees.map((a) => a.name).join(" ")}`.toLowerCase();
      if (haystack.includes(queryLower)) {
        mm.push({
          kind: "meeting",
          id: m.id,
          title: m.title,
          held_at: m.held_at,
          excerpt: excerptAround(m.transcript, trimmed, 220),
        });
      }
    }
    mm.sort((a, b) => b.held_at.localeCompare(a.held_at));

    const libById = new Map(libraryItems.map((i) => [i.paper_id, i]));
    const ll: LibraryHit[] = [];
    for (const s of scored) {
      if (!libById.has(s.paper.id)) continue;
      const r = rankPaper(s, trimmed);
      if (r) {
        ll.push({
          kind: "library",
          paper: s,
          added_by: libById.get(s.paper.id)!.added_by,
        });
      }
    }

    return {
      papers: pp.slice(0, MAX_PER_GROUP),
      meetings: mm.slice(0, MAX_PER_GROUP),
      library: ll.slice(0, MAX_PER_GROUP),
    };
  }, [scored, libraryItems, trimmed]);

  const totalHits = papers.length + meetings.length + library.length;

  return (
    <>
      <section className="mb-6">
        <h1 className="flex items-center gap-2 text-balance text-2xl font-semibold tracking-tight">
          <SearchIcon className="h-6 w-6" aria-hidden /> Search
        </h1>
        <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
          One field across papers, meetings, and your library. Matches by
          title, author, category, abstract, transcript, or attendee name.
        </p>
      </section>

      <div className="mb-6 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 focus-within:border-accent">
        <SearchIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search papers, transcripts, authors, library…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Global search"
        />
        {trimmed.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {totalHits} match{totalHits === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {trimmed.length < 2 ? (
        <EmptyState
          icon={SearchIcon}
          title="Type a query"
          description={
            <>
              Two or more characters needed. Try author surnames, paper titles,
              taxonomy slugs (<code>slam</code>, <code>optical_flow</code>),
              or sensor names (<code>davis</code>, <code>prophesee</code>).
            </>
          }
        />
      ) : totalHits === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title={`No results for "${trimmed}"`}
          description="Search is exact-substring + case-insensitive. Try a shorter prefix, an alternate spelling, or check /gaps to see if it's a coverage hole."
          cta={{ href: "/gaps", label: "Browse coverage gaps →" }}
        />
      ) : (
        <div className="space-y-8">
          {papers.length > 0 && (
            <ResultGroup
              icon={FileText}
              title="Papers"
              count={papers.length}
              cap={MAX_PER_GROUP}
            >
              {papers.map((h) => (
                <PaperResult key={h.paper.paper.id} hit={h} />
              ))}
            </ResultGroup>
          )}
          {meetings.length > 0 && (
            <ResultGroup
              icon={Mic}
              title="Meetings"
              count={meetings.length}
              cap={MAX_PER_GROUP}
            >
              {meetings.map((h) => (
                <MeetingResult key={h.id} hit={h} />
              ))}
            </ResultGroup>
          )}
          {library.length > 0 && (
            <ResultGroup
              icon={BookOpen}
              title="In your library"
              count={library.length}
              cap={MAX_PER_GROUP}
            >
              {library.map((h) => (
                <LibraryResult key={h.paper.paper.id} hit={h} />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </>
  );
}

function ResultGroup({
  icon: Icon,
  title,
  count,
  cap,
  children,
}: {
  icon: typeof FileText;
  title: string;
  count: number;
  cap: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-baseline gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {title}{" "}
        <span className="text-muted-foreground/70">({count}{count >= cap ? "+" : ""})</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function PaperResult({ hit }: { hit: PaperHit }) {
  const p = hit.paper.paper;
  return (
    <Link
      href={`/paper/${encodeURIComponent(p.id)}`}
      className="block rounded-md border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium">{p.title}</h3>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {p.authors.slice(0, 3).map((a) => a.name).join(", ")}
            {p.authors.length > 3 && ` +${p.authors.length - 3}`}
            {" · "}
            {p.venue?.name ?? "preprint"}
            {" · "}
            {formatMonthsAgo(p.months_since_publish)}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          matched: {hit.matched_in}
        </Badge>
      </div>
    </Link>
  );
}

function MeetingResult({ hit }: { hit: MeetingHit }) {
  return (
    <Link
      href={`/meetings/${hit.id}`}
      className="block rounded-md border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <h3 className="text-sm font-medium">
        {hit.title}{" "}
        <span className="ml-1 text-xs text-muted-foreground">
          · {new Date(hit.held_at).toLocaleDateString()}
        </span>
      </h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hit.excerpt}</p>
    </Link>
  );
}

function LibraryResult({ hit }: { hit: LibraryHit }) {
  const p = hit.paper.paper;
  return (
    <Link
      href={`/paper/${encodeURIComponent(p.id)}`}
      className="block rounded-md border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <h3 className="line-clamp-2 text-sm font-medium">{p.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Saved by <strong>{hit.added_by}</strong>
      </p>
    </Link>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchInner />
    </Suspense>
  );
}
