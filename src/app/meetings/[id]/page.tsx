import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSeedMeetings } from "@/lib/seed_meetings";
import { loadSeedPipeline } from "@/lib/seed";
import { fixtureMeetingDigest } from "@/lib/llm/meetings";
import { Badge } from "@/components/Badge";

export const dynamicParams = true;

export async function generateStaticParams() {
  return loadSeedMeetings().map((m) => ({ id: m.id }));
}

interface Params {
  params: Promise<{ id: string }>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimestamp(seconds?: number): string {
  if (typeof seconds !== "number") return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function MeetingDetail({ params }: Params) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const meeting = loadSeedMeetings().find((m) => m.id === decoded);
  if (!meeting) notFound();

  const corpus = loadSeedPipeline().raw.papers;
  const digest = fixtureMeetingDigest(meeting, corpus);

  // The transcript fixture is a single text block; segment it on speaker tags
  // ("Name:") so the reader gets a paragraphed view.
  const segments = splitTranscript(meeting.transcript);

  return (
    <article className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <Link
          href="/meetings"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All meetings
        </Link>
        <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">
          {meeting.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{formatDate(meeting.held_at)}</span>
          {meeting.duration_seconds && (
            <>
              <span aria-hidden>·</span>
              <span>{Math.round(meeting.duration_seconds / 60)} min</span>
            </>
          )}
          <span aria-hidden>·</span>
          <Badge variant="outline">source: {meeting.source}</Badge>
        </div>

        <section className="mt-6">
          <h2 className="text-lg font-medium">TL;DR</h2>
          <p className="mt-2 text-base">{digest.tldr}</p>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-medium">Topics</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {digest.topics.map((t) => (
              <Badge key={t} variant="muted">
                {t}
              </Badge>
            ))}
          </div>
        </section>

        {digest.paper_mentions.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-medium">Papers discussed</h2>
            <ul className="mt-2 space-y-3">
              {digest.paper_mentions.map((m) => (
                <li key={m.paper_id} className="rounded-md border p-3">
                  <Link
                    href={`/paper/${encodeURIComponent(m.paper_id)}`}
                    className="font-medium leading-snug hover:underline"
                  >
                    {m.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">{m.excerpt}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-lg font-medium">Open questions</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {digest.open_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-medium">Action items</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {digest.action_items.map((a, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="text-muted-foreground">▢</span>
                <span>
                  {a.text}
                  {a.owner ? (
                    <span className="text-muted-foreground"> — {a.owner}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium">Transcript</h2>
          <ol className="mt-3 space-y-3">
            {segments.map((seg, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <div className="w-32 shrink-0 text-muted-foreground">
                  <div className="font-medium text-foreground">{seg.speaker}</div>
                  {seg.timestamp && (
                    <div className="text-xs">{formatTimestamp(seg.timestamp)}</div>
                  )}
                </div>
                <p className="flex-1 leading-relaxed">{seg.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-8 text-xs text-muted-foreground">
          Digest generated by{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">{digest.model}</code>.
          Trigger a live LLM rerun via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            POST /api/meetings/{meeting.id}/digest
          </code>
          .
        </p>
      </div>

      <aside className="space-y-5">
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Attendees</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {meeting.attendees.map((a) => (
              <li key={a.name}>
                <div>{a.name}</div>
                {a.affiliation && (
                  <div className="text-xs text-muted-foreground">{a.affiliation}</div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Next steps</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {digest.next_steps.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Source</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {meeting.source === "drive" ? (
              <>Ingested from the ECCG Recordings folder on Google Drive.</>
            ) : meeting.source === "manual" ? (
              <>Uploaded by hand via the ingest API.</>
            ) : (
              <>Demo fixture, ships in the repo for instant preview.</>
            )}
          </p>
        </div>
      </aside>
    </article>
  );
}

interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp?: number;
}

function splitTranscript(raw: string): TranscriptSegment[] {
  if (!raw) return [];
  // Match "Speaker Name:" markers and split between them.
  const re = /([A-Z][a-zA-ZÀ-ÿ.\-' ]{1,40}?):\s+/g;
  const out: TranscriptSegment[] = [];
  let lastIndex = 0;
  let lastSpeaker = "Speaker";
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > lastIndex && lastIndex > 0) {
      out.push({
        speaker: lastSpeaker,
        text: raw.slice(lastIndex, m.index).trim(),
      });
    }
    lastSpeaker = m[1].trim();
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < raw.length) {
    out.push({
      speaker: lastSpeaker,
      text: raw.slice(lastIndex).trim(),
    });
  }
  return out.filter((s) => s.text.length > 0);
}
