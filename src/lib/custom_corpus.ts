/**
 * Shared types + Drive helpers for the user/cron-ingested papers.
 *
 * Records can be in one of three review states:
 *   - "approved"   — counts toward rankings everywhere on the site
 *   - "pending"    — visible on /review only, doesn't affect rankings yet
 *   - "rejected"   — hidden (kept in the state so we don't re-ingest)
 *
 * The cron writes new arXiv discoveries as "pending"; user-uploaded
 * papers default to "approved" (the team explicitly chose to import them).
 */

import { readState, writeState } from "./google/state";
import type { Paper } from "./models";

export const CUSTOM_CORPUS_STATE = "custom-corpus";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface UploadedRecord {
  paper: Paper;
  score_base: number;
  uploaded_by: string;
  uploaded_at: string;
  source_file: string;
  status?: ReviewStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
}

export async function loadCustomCorpus(): Promise<UploadedRecord[]> {
  return readState<UploadedRecord[]>(CUSTOM_CORPUS_STATE, []);
}

export async function saveCustomCorpus(records: UploadedRecord[]): Promise<void> {
  await writeState(CUSTOM_CORPUS_STATE, records);
}

export function statusOf(r: UploadedRecord): ReviewStatus {
  return r.status ?? "approved";
}

export function isVisibleInRankings(r: UploadedRecord): boolean {
  const s = statusOf(r);
  return s === "approved";
}
