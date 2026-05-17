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

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { votes } = await loadCollab();
  const detail = new URL(req.url).searchParams.get("detail") === "1";
  if (detail) {
    return NextResponse.json({ votes, total_papers: Object.keys(votes).length });
  }
  // Compact response: per-paper aggregate counts + editor-weighted net.
  const compact: Record<
    string,
    {
      up: number;
      down: number;
      net: number;
      editor_up: number;
      editor_down: number;
      weighted_net: number;
    }
  > = {};
  for (const [id, v] of Object.entries(votes)) {
    let editorUp = 0;
    let editorDown = 0;
    for (const voter of v.voters) {
      // Voter alias is the only signal we have on cast; check it against
      // both the alias and email allowlists.
      if (isEditor(voter.voter, voter.voter.includes("@") ? voter.voter : undefined)) {
        if (voter.value === 1) editorUp++;
        else if (voter.value === -1) editorDown++;
      }
    }
    // Editor votes count 2x — that's the base 1 already counted in net,
    // plus an extra 1 per editor vote here.
    const weighted_net = v.net + (editorUp - editorDown);
    compact[id] = {
      up: v.upvotes,
      down: v.downvotes,
      net: v.net,
      editor_up: editorUp,
      editor_down: editorDown,
      weighted_net,
    };
  }
  return NextResponse.json({
    votes: compact,
    total_papers: Object.keys(compact).length,
  });
}
