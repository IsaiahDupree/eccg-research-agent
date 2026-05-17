"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Bookmark, Loader2, MessageSquare, Upload,
} from "lucide-react";
import { loadSeedPipelineClient } from "@/lib/seed_client";
import { Badge } from "@/components/Badge";
import { categoryLabel } from "@/lib/utils";
import type { ScoredPaper } from "@/lib/models";

interface LibraryEntry {
  paper_id: string;
  added_by: string;
  added_at: string;
}
interface NoteEntry {
  id: string;
  paper_id: string;
  author: string;
  body: string;
  created_at: string;
}
interface VoteEntryRaw {
  voter: string;
  value: 1 | -1;
  voted_at: string;
  reason?: string;
}
interface UploadRecord {
  paper: { id: string; title: string; eccg_category?: string };
  uploaded_by: string;
  uploaded_at: string;
  source_file: string;
}

interface TimelineEvent {
  kind: "library" | "note" | "vote" | "upload";
  at: string;
  paper_id?: string;
  paper_title?: string;
  actor: string;
  detail?: string;
  value?: 1 | -1;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export default function WhatsNewPage() {
  const [scored, setScored] = useState<ScoredPaper[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setScored(loadSeedPipelineClient().scored);
    let alive = true;
    (async () => {
      try {
        const [libRes, votesRes, uploadsRes] = await Promise.all([
          fetch("/api/library").then((r) => r.json()),
          fetch("/api/votes?detail=1")
            .then((r) => r.json())
            .catch(() => ({ votes: {} })),
          fetch("/api/corpus/custom")
            .then((r) => r.json())
            .catch(() => ({ records: [] })),
        ]);
        if (!alive) return;

        const lib: LibraryEntry[] = libRes.library ?? [];
        const uploadList: UploadRecord[] = uploadsRes.records ?? [];

        // Collect events from each source.
        const ev: TimelineEvent[] = [];
        for (const item of lib) {
          ev.push({
            kind: "library",
            at: item.added_at,
            paper_id: item.paper_id,
            actor: item.added_by,
          });
        }
        for (const r of uploadList) {
          ev.push({
            kind: "upload",
            at: r.uploaded_at,
            paper_id: r.paper.id,
            paper_title: r.paper.title,
            actor: r.uploaded_by,
            detail: r.source_file,
          });
        }

        // The bulk /api/votes returns counts only. For per-vote details we
        // need the per-paper endpoint, which we only call for papers that
        // *appear* in the library — keeps the request count small.
        const paperIds = new Set<string>(
          [...lib.map((l) => l.paper_id), ...uploadList.map((u) => u.paper.id)],
        );
        const perPaper = await Promise.all(
          Array.from(paperIds).map(async (id) => {
            const [v, n] = await Promise.all([
              fetch(`/api/votes/${encodeURIComponent(id)}`)
                .then((r) => r.json())
                .catch(() => null),
              fetch(`/api/notes/${encodeURIComponent(id)}`)
                .then((r) => r.json())
                .catch(() => null),
            ]);
            return { id, v, n };
          }),
        );
        for (const { id, v, n } of perPaper) {
          if (v?.votes?.voters) {
            for (const voter of v.votes.voters as VoteEntryRaw[]) {
              ev.push({
                kind: "vote",
                at: voter.voted_at,
                paper_id: id,
                actor: voter.voter,
                value: voter.value,
                detail: voter.reason,
              });
            }
          }
          if (n?.notes) {
            for (const note of n.notes as NoteEntry[]) {
              ev.push({
                kind: "note",
                at: note.created_at,
                paper_id: id,
                actor: note.author,
                detail: note.body,
              });
            }
          }
        }
        ev.sort((a, b) => b.at.localeCompare(a.at));
        setEvents(ev);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map(scored.map((s) => [s.paper.id, s])), [scored]);

  const past7d = useMemo(
    () => events.filter((e) => Date.now() - Date.parse(e.at) < 7 * DAY_MS),
    [events],
  );
  const older = useMemo(
    () => events.filter((e) => Date.now() - Date.parse(e.at) >= 7 * DAY_MS),
    [events],
  );

  const counts = useMemo(() => {
    const c = { library: 0, vote: 0, note: 0, upload: 0 };
    for (const e of past7d) c[e.kind]++;
    return c;
  }, [past7d]);

  async function downloadWeeklyDigest() {
    const r = await fetch("/api/digest/weekly?days=7");
    if (!r.ok) return;
    const md = await r.text();
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eccg-digest-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <section className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">What&apos;s new</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Activity from the shared Drive store. Subscribe to the{" "}
              <Link href="/feed.xml" className="underline">RSS feed</Link>{" "}
              to follow new top-ranked papers in your reader.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadWeeklyDigest}
            disabled={!loaded}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            title="Download a markdown weekly digest (last 7 days)"
          >
            <Upload className="h-3.5 w-3.5 rotate-180" /> Download digest
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Library adds (7d)" value={counts.library} icon={<Bookmark className="h-3.5 w-3.5" />} />
          <Stat label="Votes (7d)" value={counts.vote} icon={<ArrowUp className="h-3.5 w-3.5" />} />
          <Stat label="Notes (7d)" value={counts.note} icon={<MessageSquare className="h-3.5 w-3.5" />} />
          <Stat label="Uploads (7d)" value={counts.upload} icon={<Upload className="h-3.5 w-3.5" />} />
        </dl>
      </section>

      {!loaded ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading shared Drive state…
        </div>
      ) : past7d.length === 0 && older.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
          Nothing yet. Cast a vote, save a paper, or upload a spreadsheet to see it here.
        </div>
      ) : (
        <>
          <Section title="Last 7 days" events={past7d} byId={byId} />
          {older.length > 0 && (
            <details className="mt-8">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                Older ({older.length})
              </summary>
              <div className="mt-3">
                <Section title="" events={older} byId={byId} />
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Section({
  title,
  events,
  byId,
}: {
  title: string;
  events: TimelineEvent[];
  byId: Map<string, ScoredPaper>;
}) {
  return (
    <section>
      {title && (
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
      )}
      <ol className="space-y-2">
        {events.map((e, i) => {
          const s = e.paper_id ? byId.get(e.paper_id) : undefined;
          const paperTitle = s?.paper.title ?? e.paper_title ?? e.paper_id ?? "";
          return (
            <li
              key={`${e.kind}-${i}`}
              className="flex items-start gap-3 rounded-md border p-3 text-sm"
            >
              <EventIcon kind={e.kind} value={e.value} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5 text-xs text-muted-foreground">
                  <strong className="text-foreground">{e.actor}</strong>
                  <span>{verb(e)}</span>
                  {e.paper_id && (
                    <Link
                      href={`/paper/${encodeURIComponent(e.paper_id)}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {paperTitle.slice(0, 90)}
                      {paperTitle.length > 90 ? "…" : ""}
                    </Link>
                  )}
                  {s?.paper.eccg_category && (
                    <Badge variant="outline">{categoryLabel(s.paper.eccg_category)}</Badge>
                  )}
                  <span className="ml-auto text-[11px]">{relative(e.at)}</span>
                </div>
                {e.detail && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.detail}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function EventIcon({ kind, value }: { kind: TimelineEvent["kind"]; value?: 1 | -1 }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0";
  if (kind === "library") return <Bookmark className={`${cls} text-accent`} aria-hidden />;
  if (kind === "note") return <MessageSquare className={`${cls} text-amber-600`} aria-hidden />;
  if (kind === "upload") return <Upload className={`${cls} text-indigo-600`} aria-hidden />;
  if (kind === "vote") {
    return value === 1 ? (
      <ArrowUp className={`${cls} text-emerald-600`} aria-hidden />
    ) : (
      <ArrowDown className={`${cls} text-rose-600`} aria-hidden />
    );
  }
  return null;
}

function verb(e: TimelineEvent): string {
  if (e.kind === "library") return "saved";
  if (e.kind === "vote") return e.value === 1 ? "upvoted" : "downvoted";
  if (e.kind === "note") return "noted on";
  if (e.kind === "upload") return "uploaded";
  return "did";
}

function relative(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
