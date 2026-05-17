/**
 * GET /api/review/audit?limit=50
 *
 * Read-only view of the most recent /review decisions. Used by the
 * "Recent decisions" panel on /review.
 */

import { NextResponse } from "next/server";
import { loadAudit } from "@/lib/review_audit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "50")));
  const entries = (await loadAudit()).slice(0, limit);
  return NextResponse.json({
    count: entries.length,
    entries,
  });
}
