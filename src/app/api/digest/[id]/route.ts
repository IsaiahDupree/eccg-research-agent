import { NextResponse } from "next/server";
import { readCachedDigest, writeCachedDigest } from "@/lib/llm/digest_cache";
import { generateDigest, fixtureDigest, LlmUnavailableError } from "@/lib/llm/provider";
import { loadSeedPipeline } from "@/lib/seed";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const result = loadSeedPipeline();
  const scored = result.scored.find((s) => s.paper.id === decoded);
  if (!scored) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  // Read-through: serve from Drive cache when content hash still matches.
  if (!force) {
    const cached = await readCachedDigest(scored).catch(() => null);
    if (cached) {
      return NextResponse.json({ ok: true, digest: cached, cached: true });
    }
  }

  try {
    const digest = await generateDigest(scored);
    // Persist asynchronously — don't make the editor wait on Drive.
    writeCachedDigest(scored, digest).catch((err) => {
      console.warn("digest cache write failed:", err);
    });
    return NextResponse.json({ ok: true, digest, cached: false });
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
