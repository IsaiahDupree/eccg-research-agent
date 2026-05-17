/**
 * POST /api/embed/incremental
 *
 * Walks the custom-corpus (Drive-state) and embeds any paper that doesn't
 * yet have a vector — or whose content hash has changed. Stores results in
 * `eccg-state—custom-embeddings.json`. Cheap and idempotent; safe to call
 * repeatedly.
 *
 * Auth: same REFRESH_SECRET as /api/refresh — this is a cron-tier action.
 */

import { NextResponse } from "next/server";
import { embedPapersIncremental, hasOpenAi } from "@/lib/embeddings";
import { loadCustomCorpus } from "@/lib/custom_corpus";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return run(req);
}

export async function GET(req: Request) {
  return run(req);
}

async function run(req: Request) {
  const expected = process.env.REFRESH_SECRET;
  if (expected) {
    const provided =
      req.headers.get("authorization") ?? new URL(req.url).searchParams.get("token");
    if (provided !== `Bearer ${expected}` && provided !== expected) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  if (!hasOpenAi()) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY not configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "200");
  const includePending = url.searchParams.get("include_pending") === "1";

  const corpus = await loadCustomCorpus();
  const candidates = corpus
    .filter((r) => includePending || (r.status ?? "approved") === "approved")
    .map((r) => r.paper);

  try {
    const result = await embedPapersIncremental(candidates, limit);
    return NextResponse.json({
      ok: true,
      candidates: candidates.length,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
