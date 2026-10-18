/**
 * Returns user-uploaded papers persisted to Drive state.
 * Read-only — uploads happen via /api/ingest/spreadsheet?persist=true.
 * Pending-review records are hidden by default; pass ?include=pending or
 * ?status=all|pending|rejected to see them.
 */

import { NextResponse } from "next/server";
import { loadCustomCorpus, statusOf } from "@/lib/custom_corpus";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const include = url.searchParams.get("include");
  const status = url.searchParams.get("status");
  const all = await loadCustomCorpus();
  let records = all;
  if (status === "all") {
    // everything
  } else if (status === "pending") {
    records = all.filter((r) => statusOf(r) === "pending");
  } else if (status === "rejected") {
    records = all.filter((r) => statusOf(r) === "rejected");
  } else if (include === "pending") {
    records = all.filter((r) => statusOf(r) !== "rejected");
  } else {
    records = all.filter((r) => statusOf(r) === "approved");
  }
  return NextResponse.json({
    count: records.length,
    total: all.length,
    counts: {
      approved: all.filter((r) => statusOf(r) === "approved").length,
      pending: all.filter((r) => statusOf(r) === "pending").length,
      rejected: all.filter((r) => statusOf(r) === "rejected").length,
    },
    records,
  });
}
