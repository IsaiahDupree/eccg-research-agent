import { NextResponse } from "next/server";
import { generateMeetingDigest } from "@/lib/llm/meetings";
import {
  downloadDriveAudio,
  listEccgRecordings,
  uploadAudioToEccg,
  ECCG_RECORDINGS_FOLDER_ID,
} from "@/lib/sources/drive";
import { loadSeedPipeline } from "@/lib/seed";
import { transcribeAudio } from "@/lib/transcription/whisper";
import type { Meeting } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — Whisper of 30-60 min recordings

/**
 * Drive-driven ingest endpoint. Three modes:
 *
 *   POST {}                                    → probe Drive folder
 *   POST {"drive_file_id":"..."}               → download → Whisper → digest
 *   POST {"transcript":"...","title":"..."}    → digest a supplied transcript
 *
 * Upload is a separate verb to keep payload shapes simple:
 *
 *   PUT  (multipart, field "file")             → upload audio to Recordings/
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body → probe
  }
  const driveFileId = typeof body.drive_file_id === "string" ? body.drive_file_id : undefined;
  const transcript = typeof body.transcript === "string" ? body.transcript : undefined;
  const title = typeof body.title === "string" ? body.title : "ECCG ingest";
  const heldAt =
    typeof body.held_at === "string" ? body.held_at : new Date().toISOString();
  const language = typeof body.language === "string" ? body.language : undefined;

  const corpus = loadSeedPipeline().raw.papers;

  // Probe
  if (!driveFileId && !transcript) {
    const files = await listEccgRecordings();
    return NextResponse.json({
      ok: true,
      mode: "probe",
      drive_folder_id: ECCG_RECORDINGS_FOLDER_ID,
      drive_visible_audio_files: files.length,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        mime_type: f.mime_type,
        size: f.size,
        modified_at: f.modified_at,
      })),
      hint:
        files.length === 0
          ? "Folder empty or auth not configured. Set GOOGLE_DRIVE_CLIENT_ID / _SECRET / _REFRESH_TOKEN."
          : "POST again with { drive_file_id } to ingest a file.",
    });
  }

  // Drive file
  if (driveFileId) {
    const stages: string[] = [];
    try {
      stages.push("download");
      const buf = await downloadDriveAudio(driveFileId);
      if (!buf) {
        return NextResponse.json(
          { ok: false, stage: "download", error: "drive_download_failed" },
          { status: 502 },
        );
      }
      stages.push(`downloaded ${buf.byteLength} bytes`);

      stages.push("transcribe");
      const tx = await transcribeAudio(buf, `${driveFileId}.m4a`, {
        language,
        mimeType: "audio/mp4",
      });
      if (!tx) {
        return NextResponse.json(
          { ok: false, stage: "transcribe", error: "transcription_unavailable" },
          { status: 502 },
        );
      }
      stages.push(`transcribed ${tx.text.length} chars (${tx.duration_seconds ?? "?"}s)`);

      const meeting: Meeting = {
        id: `drive-${driveFileId}`,
        title,
        held_at: heldAt,
        duration_seconds: tx.duration_seconds,
        source: "drive",
        drive_file_id: driveFileId,
        attendees: [],
        transcript: tx.text,
        language: tx.language,
      };

      stages.push("digest");
      const digest = await generateMeetingDigest(meeting, corpus);
      stages.push("ok");
      return NextResponse.json({ ok: true, mode: "drive", meeting, digest, stages });
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}` : String(err);
      console.error("[ingest:drive]", stages, msg);
      return NextResponse.json(
        { ok: false, stage: stages[stages.length - 1] ?? "?", stages, error: msg.slice(0, 500) },
        { status: 500 },
      );
    }
  }

  // Manual transcript
  const meeting: Meeting = {
    id: `manual-${Date.now()}`,
    title,
    held_at: heldAt,
    source: "manual",
    attendees: [],
    transcript: transcript!,
  };
  try {
    const digest = await generateMeetingDigest(meeting, corpus);
    return NextResponse.json({ ok: true, mode: "manual", meeting, digest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fall back to lexical-only digest so the request is never a hard 500
    const { extractMentionsLexical } = await import("@/lib/analysis/paper_mentions");
    const paper_mentions = extractMentionsLexical(meeting.transcript, corpus);
    return NextResponse.json(
      {
        ok: true,
        mode: "manual",
        meeting,
        digest: {
          meeting,
          tldr: "(LLM unavailable — lexical extract only)",
          topics: [],
          paper_mentions,
          action_items: [],
          open_questions: [],
          next_steps: [],
          generated_at: new Date().toISOString(),
          model: "lexical-fallback",
        },
        warning: `LLM unavailable: ${msg.slice(0, 300)}`,
      },
      { status: 200 },
    );
  }
}

/**
 * Upload an audio file to the ECCG Recordings folder.
 * Expects multipart/form-data with field "file".
 */
export async function PUT(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { ok: false, error: "expected multipart/form-data with 'file' field" },
      { status: 400 },
    );
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "missing 'file' field" },
      { status: 400 },
    );
  }
  try {
    const meta = await uploadAudioToEccg(
      await file.arrayBuffer(),
      file.name,
      { mimeType: file.type || "audio/mpeg" },
    );
    return NextResponse.json({ ok: true, mode: "upload", file: meta });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST(new Request("https://x", { method: "POST", body: "" }));
}
