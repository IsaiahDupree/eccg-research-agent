import { NextResponse } from "next/server";
import { generateDigest, fixtureDigest, LlmUnavailableError } from "@/lib/llm/provider";
import { loadSeedPipeline } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const result = loadSeedPipeline();
  const scored = result.scored.find((s) => s.paper.id === decoded);
  if (!scored) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  try {
    const digest = await generateDigest(scored);
    return NextResponse.json({ ok: true, digest });
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      return NextResponse.json({ ok: true, digest: fixtureDigest(scored), fallback: true });
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
