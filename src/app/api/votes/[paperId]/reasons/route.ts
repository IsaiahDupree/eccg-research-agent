/**
 * GET /api/votes/[paperId]/reasons
 *
 * Returns just the reason strings voters left for this paper, separated
 * into up + down. Voter aliases are included so the team can attribute,
 * but reasons are short-circuited to 200 chars (already enforced on
 * write, but defensive here too).
 */

import { NextResponse } from "next/server";
import { loadCollab } from "@/lib/collab";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ paperId: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { paperId } = await params;
  const decoded = decodeURIComponent(paperId);
  const { votes } = await loadCollab();
  const tally = votes[decoded];
  if (!tally) {
    return NextResponse.json({ paper_id: decoded, up: [], down: [] });
  }
  const up: { voter: string; reason: string; voted_at: string }[] = [];
  const down: typeof up = [];
  for (const v of tally.voters) {
    if (!v.reason) continue;
    const entry = {
      voter: v.voter,
      reason: v.reason.slice(0, 200),
      voted_at: v.voted_at,
    };
    if (v.value === 1) up.push(entry);
    else if (v.value === -1) down.push(entry);
  }
  up.sort((a, b) => b.voted_at.localeCompare(a.voted_at));
  down.sort((a, b) => b.voted_at.localeCompare(a.voted_at));
  return NextResponse.json({ paper_id: decoded, up, down });
}
