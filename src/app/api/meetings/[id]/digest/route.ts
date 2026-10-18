import { NextResponse } from "next/server";
import { fixtureMeetingDigest, generateMeetingDigest } from "@/lib/llm/meetings";
import { LlmUnavailableError } from "@/lib/llm/provider";
import { loadSeedMeetings } from "@/lib/seed_meetings";
import { loadSeedPipeline } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const meeting = loadSeedMeetings().find((m) => m.id === decoded);
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const corpus = loadSeedPipeline().raw.papers;
  try {
    const digest = await generateMeetingDigest(meeting, corpus);
    return NextResponse.json({ ok: true, digest });
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      return NextResponse.json({
        ok: true,
        digest: fixtureMeetingDigest(meeting, corpus),
        fallback: true,
      });
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
