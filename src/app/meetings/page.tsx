import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Mic, FileText, Cloud, ExternalLink } from "lucide-react";
import { loadSeedMeetings } from "@/lib/seed_meetings";
import { loadSeedPipeline } from "@/lib/seed";
import { extractMentionsLexical } from "@/lib/analysis/paper_mentions";
import {
  listEccgRecordings,
  ECCG_RECORDINGS_FOLDER_ID,
} from "@/lib/sources/drive";

export const metadata: Metadata = {
  title: "ECCG meetings",
  description:
    "Transcripts and digests of recurring Event Camera Community Group meetings, with extracted paper mentions linked back to the corpus.",
  alternates: { canonical: "/meetings" },
  openGraph: {
    title: "ECCG meetings — transcripts + paper mentions",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 60;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

export default async function MeetingsPage() {
  const meetings = loadSeedMeetings();
  const corpus = loadSeedPipeline().raw.papers;
  const driveFiles = await listEccgRecordings();

  const enriched = meetings
    .map((m) => ({
      ...m,
      mention_count: extractMentionsLexical(m.transcript, corpus).length,
    }))
    .sort((a, b) => b.held_at.localeCompare(a.held_at));

  return (
    <>
      <section className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Recordings from ECCG sessions. When an MP3 lands in the{" "}
          <a
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
            href="https://drive.google.com/drive/folders/1i0dl8vuuwv2XaAZ6bqxM2mNPvPuRDR5q"
          >
            ECCG Recordings folder
          </a>{" "}
          on Google Drive, the ingest pipeline transcribes it with Whisper,
          summarises with an LLM, and links every paper mention back to the
          corpus. The two meetings below are demo fixtures wired through the
          same pipeline so you can see what the live view will look like.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5" />
            Drive folder: {driveFiles.length === 0 ? "empty" : `${driveFiles.length} file${driveFiles.length === 1 ? "" : "s"}`}
          </span>
          <span aria-hidden>·</span>
          <span>POST <code className="rounded bg-muted px-1 py-0.5">/api/meetings/ingest</code> with <code className="rounded bg-muted px-1 py-0.5">{`{drive_file_id}`}</code></span>
        </div>
      </section>

      {driveFiles.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            <Cloud className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
            In Drive — awaiting ingestion
          </h2>
          <ul className="space-y-2">
            {driveFiles.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.mime_type}
                    {f.size ? ` · ${(f.size / 1048576).toFixed(1)} MB` : ""}
                    {" · modified "}
                    {new Date(f.modified_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {f.webViewLink && (
                    <a
                      href={f.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Drive <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <code className="rounded bg-background px-2 py-1 text-[11px]">
                    POST /api/meetings/ingest {`{drive_file_id: "${f.id}"}`}
                  </code>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Source folder:{" "}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://drive.google.com/drive/folders/${ECCG_RECORDINGS_FOLDER_ID}`}
            >
              ECCG / Recordings
            </a>
          </p>
        </section>
      )}

      <ul className="space-y-3">
        {enriched.map((m) => (
          <li key={m.id}>
            <Link
              href={`/meetings/${encodeURIComponent(m.id)}`}
              className="group block rounded-lg border p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-medium leading-snug group-hover:underline">
                    {m.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {m.transcript.slice(0, 220)}…
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {formatDate(m.held_at)}
                  </div>
                  <div className="mt-1">{formatDuration(m.duration_seconds)}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{m.attendees.length} attendees</span>
                <span aria-hidden>·</span>
                <span>
                  {m.mention_count} corpus mention{m.mention_count === 1 ? "" : "s"}
                </span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {m.source}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
