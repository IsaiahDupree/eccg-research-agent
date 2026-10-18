/**
 * Append-only audit log of /review decisions.
 *
 * Each approve/reject — single or bulk — adds an entry to
 * `eccg-state—review-audit.json`. /review surfaces the last N entries so
 * the team can spot drive-by approvals without round-tripping to Drive,
 * and so that "who said what when" survives even if the underlying paper
 * is later re-reviewed.
 *
 * Capped at AUDIT_CAP entries — older ones drop off the head of the log.
 */

import { readState, writeState } from "./google/state";
import { AuditStateSchema, safeParseDriveState } from "./state_schemas";

export const AUDIT_STATE = "review-audit";
const AUDIT_CAP = 2_000;

export interface AuditEntry {
  at: string;             // ISO timestamp
  actor: string;          // verified email when signed-in, alias otherwise
  action: "approve" | "reject";
  paper_ids: string[];    // single-paper acts include one id
  category?: string;      // set on bulk-by-category calls
  niche?: string;         // optional niche tag the action came from
  note?: string;          // optional reviewer note (≤ 200 chars)
  source: "single" | "bulk_ids" | "bulk_category";
}

export async function loadAudit(): Promise<AuditEntry[]> {
  const raw = await readState<unknown>(AUDIT_STATE, []);
  const parsed = safeParseDriveState(AUDIT_STATE, raw, AuditStateSchema, []);
  return parsed.value as AuditEntry[];
}

export async function appendAudit(entry: AuditEntry): Promise<void> {
  const log = await loadAudit();
  log.unshift(entry);
  if (log.length > AUDIT_CAP) log.length = AUDIT_CAP;
  await writeState<AuditEntry[]>(AUDIT_STATE, log);
}
