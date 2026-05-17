/**
 * POST /api/review/bulk
 *   { paper_ids?: string[], category?: string, status_in?: "pending"|"approved"|"rejected",
 *     action: "approve"|"reject", user?: string, note?: string }
 *
 * Either pass an explicit `paper_ids` list, or pass a `category` and the
 * endpoint will resolve every record matching that category + status_in
 * (default: pending). Useful for "approve all 32 control_robotics papers
 * the cron found this morning".
 */

import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth/session";
import {
  loadCustomCorpus,
  saveCustomCorpus,
  statusOf,
} from "@/lib/custom_corpus";
import {
  isEditor,
  isEditorsEnforced,
  listEditors,
  listEditorEmails,
  readApiTokenAttribution,
} from "@/lib/editors";
import { appendAudit } from "@/lib/review_audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    paper_ids?: string[];
    category?: string;
    status_in?: "pending" | "approved" | "rejected";
    action?: "approve" | "reject";
    user?: string;
    note?: string;
  };

  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { ok: false, error: "action must be approve or reject" },
      { status: 400 },
    );
  }

  const session = readSessionFromRequest(req);
  const user = (body.user ?? session?.email ?? "anonymous").toString().slice(0, 80);
  const tokenAttribution = readApiTokenAttribution(req);
  if (!tokenAttribution && !isEditor(user, session?.email)) {
    return NextResponse.json(
      {
        ok: false,
        error: `'${user}' is not on the editor allowlist`,
        editors_enforced: isEditorsEnforced(),
        editors: listEditors(),
        editor_emails: listEditorEmails(),
      },
      { status: 403 },
    );
  }

  const records = await loadCustomCorpus();
  const statusIn = body.status_in ?? "pending";
  const explicit = new Set(body.paper_ids ?? []);

  let targetIds: Set<string>;
  if (explicit.size > 0) {
    targetIds = explicit;
  } else if (body.category) {
    const cat = body.category.toLowerCase();
    targetIds = new Set(
      records
        .filter((r) => statusOf(r) === statusIn)
        .filter((r) => (r.paper.eccg_category ?? "unclassified").toLowerCase() === cat)
        .map((r) => r.paper.id),
    );
  } else {
    return NextResponse.json(
      { ok: false, error: "provide paper_ids or category" },
      { status: 400 },
    );
  }

  if (targetIds.size === 0) {
    return NextResponse.json({ ok: true, changed: 0 });
  }

  const reviewedBy = tokenAttribution ?? session?.email ?? user;
  const reviewedAt = new Date().toISOString();
  const note = body.note?.slice(0, 400);

  let changed = 0;
  for (let i = 0; i < records.length; i++) {
    if (!targetIds.has(records[i].paper.id)) continue;
    records[i] = {
      ...records[i],
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt,
      review_note: note,
    };
    changed++;
  }
  await saveCustomCorpus(records);

  // Audit: log the bulk action so /review can show "approved 32 control_robotics"
  // alongside the single-paper acts. Best-effort.
  appendAudit({
    at: reviewedAt,
    actor: reviewedBy,
    action,
    paper_ids: Array.from(targetIds),
    category: body.category,
    note,
    source: body.category ? "bulk_category" : "bulk_ids",
  }).catch((err) => console.warn("audit append failed:", err));

  return NextResponse.json({
    ok: true,
    action,
    changed,
    requested: targetIds.size,
  });
}
