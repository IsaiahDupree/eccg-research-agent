import { NextResponse } from "next/server";
import { loadSeedMeetings } from "@/lib/seed_meetings";
import { loadSeedPipeline } from "@/lib/seed";
import { extractMentionsLexical } from "@/lib/analysis/paper_mentions";
import { listEccgRecordings } from "@/lib/sources/drive";

export const runtime = "nodejs";

export async function GET() {
  const fixtures = loadSeedMeetings();
  const corpus = loadSeedPipeline().raw.papers;
  const driveFiles = await listEccgRecordings();

  return NextResponse.json({
    count: fixtures.length,
    drive_folder_id: "1i0dl8vuuwv2XaAZ6bqxM2mNPvPuRDR5q",
    drive_visible_audio_files: driveFiles.length,
    drive_files: driveFiles.map((f) => ({
      id: f.id,
      name: f.name,
      mime_type: f.mime_type,
      size: f.size,
      modified_at: f.modified_at,
      url: f.webViewLink,
    })),
    meetings: fixtures.map((m) => ({
      id: m.id,
      title: m.title,
      held_at: m.held_at,
      duration_seconds: m.duration_seconds,
      attendees: m.attendees.map((a) => a.name),
      source: m.source,
      mention_count: extractMentionsLexical(m.transcript, corpus).length,
    })),
  });
}
