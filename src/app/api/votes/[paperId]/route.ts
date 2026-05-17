import { NextResponse } from "next/server";
import {
  loadCollab,
  recomputeVoteCounts,
  saveVotes,
  type CollabVotesPerPaper,
} from "@/lib/collab";
import { rateLimit, rateLimitHeaders } from "@/lib/ratelimit";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ paperId: string }>;
}

const EMPTY: CollabVotesPerPaper = { upvotes: 0, downvotes: 0, net: 0, voters: [] };

export async function GET(_req: Request, { params }: Ctx) {
  const { paperId } = await params;
  const decoded = decodeURIComponent(paperId);
  const { votes } = await loadCollab();
  return NextResponse.json({ paper_id: decoded, votes: votes[decoded] ?? EMPTY });
}

export async function POST(req: Request, { params }: Ctx) {
  const { paperId } = await params;
  const decoded = decodeURIComponent(paperId);
  const body = (await req.json().catch(() => ({}))) as Partial<{
    value: number;             // +1 | -1 | 0 (0 == clear)
    reason: string;
    voter: string;
  }>;
  const value = body.value === -1 ? -1 : body.value === 1 ? 1 : 0;
  const voter = (body.voter ?? "anonymous").trim().slice(0, 40) || "anonymous";
  const reason = (body.reason ?? "").trim().slice(0, 200) || undefined;

  const limit = await rateLimit({ alias: voter });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limit_exceeded", retry_after_ms: limit.retry_after_ms },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const { votes } = await loadCollab();
  const current = votes[decoded] ?? { ...EMPTY, voters: [] };
  // Remove any existing vote by this voter
  const without = current.voters.filter((v) => v.voter !== voter);
  const next: CollabVotesPerPaper = {
    upvotes: 0,
    downvotes: 0,
    net: 0,
    voters: value === 0 ? without : [...without, { voter, value, reason, voted_at: new Date().toISOString() }],
  };
  const finalized = recomputeVoteCounts(next);
  const updated = { ...votes, [decoded]: finalized };
  await saveVotes(updated);
  return NextResponse.json(
    { ok: true, votes: finalized },
    { headers: rateLimitHeaders(limit) },
  );
}
