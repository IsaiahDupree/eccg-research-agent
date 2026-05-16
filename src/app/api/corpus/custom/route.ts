/**
 * Returns user-uploaded papers persisted to Drive state.
 * Read-only — uploads happen via /api/ingest/spreadsheet?persist=true.
 */

import { NextResponse } from "next/server";
import { readState } from "@/lib/google/state";
import type { Paper } from "@/lib/models";

const STATE_NAME = "custom-corpus";

interface UploadedRecord {
  paper: Paper;
  score_base: number;
  uploaded_by: string;
  uploaded_at: string;
  source_file: string;
}

export const runtime = "nodejs";

export async function GET() {
  const records = await readState<UploadedRecord[]>(STATE_NAME, []);
  return NextResponse.json({ count: records.length, records });
}
