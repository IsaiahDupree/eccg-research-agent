/**
 * Bulk votes endpoint. Returns the full Drive-backed votes dict so the
 * client can render counts on every paper without an individual fetch.
 */

import { NextResponse } from "next/server";
import { loadCollab } from "@/lib/collab";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { votes } = await loadCollab();
  const detail = new URL(req.url).searchParams.get("detail") === "1";
  if (detail) {
    return NextResponse.json({ votes, total_papers: Object.keys(votes).length });
  }
  const compact: Record<string, { up: number; down: number; net: number }> = {};
  for (const [id, v] of Object.entries(votes)) {
    compact[id] = { up: v.upvotes, down: v.downvotes, net: v.net };
  }
  return NextResponse.json({ votes: compact, total_papers: Object.keys(compact).length });
}
