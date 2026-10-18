/**
 * Bulk votes endpoint. Returns the full Drive-backed votes dict so the
 * client can render counts on every paper without an individual fetch.
 *
 * Editor weighting: votes whose voter alias matches EDITORS (or whose
 * voter exactly matches an entry in EDITORS_EMAILS) count 2× in
 * `weighted_net`. This is what the leaderboard "influence" mode and the
 * home-page community boost actually rank on.
 */

import { NextResponse } from "next/server";
import { loadCollab } from "@/lib/collab";
import { isEditor } from "@/lib/editors";
import { weightTallies } from "@/lib/votes_weighting";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { votes } = await loadCollab();
  const detail = new URL(req.url).searchParams.get("detail") === "1";
  if (detail) {
    return NextResponse.json({ votes, total_papers: Object.keys(votes).length });
  }
  // Voter alias is the only signal we have on cast; check it against both
  // the alias and email allowlists (an alias that looks like an email is
  // also exposed to the email allowlist).
  const isEditorVoter = (voter: string) =>
    isEditor(voter, voter.includes("@") ? voter : undefined);
  const compact = weightTallies(votes, isEditorVoter);
  return NextResponse.json({
    votes: compact,
    total_papers: Object.keys(compact).length,
  });
}
