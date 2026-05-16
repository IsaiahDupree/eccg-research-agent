import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — arXiv + S2 + LLM can be slow

/**
 * Live-refresh endpoint. Invoked daily by Vercel cron.
 *
 * V1: returns the freshly-fetched corpus. V1.1: writes to Vercel KV so the
 * homepage can serve fresh data without re-running the pipeline on every
 * request.
 */
export async function GET(req: Request) {
  // Optional shared-secret auth for the cron
  const expected = process.env.REFRESH_SECRET;
  if (expected) {
    const provided = req.headers.get("authorization") ?? new URL(req.url).searchParams.get("token");
    if (provided !== `Bearer ${expected}` && provided !== expected) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runPipeline({
      niche: process.env.ECCG_NICHE ?? "event_camera",
      topN: 20,
      generateDigests: false, // separate endpoint will digest the top-N on demand
    });
    return NextResponse.json({
      ok: true,
      refreshed_at: new Date().toISOString(),
      count: result.scored.length,
      top: result.scored.slice(0, 10).map((s) => ({
        id: s.paper.id,
        title: s.paper.title,
        score: s.total,
        category: s.paper.eccg_category,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
