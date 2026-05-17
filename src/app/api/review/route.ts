/**
 * POST /api/review { paper_id, action: "approve" | "reject", user, note? }
 *
 * Editor-gated. Sets the review status on a custom-corpus record and
 * persists. Once approved, the paper appears in /, /leaderboard, /influential,
 * etc; once rejected, it stays in the state file but is hidden everywhere.
 */

import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth/session";
import {
  CUSTOM_CORPUS_STATE,
  loadCustomCorpus,
  saveCustomCorpus,
} from "@/lib/custom_corpus";
import {
  isEditor,
  isEditorsEnforced,
  listEditors,
  listEditorEmails,
  readApiTokenAttribution,
} from "@/lib/editors";
import { rateLimit, rateLimitHeaders } from "@/lib/ratelimit";
import { appendAudit } from "@/lib/review_audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    paper_id?: string;
    action?: "approve" | "reject";
    user?: string;
    note?: string;
  };
  const { paper_id, action } = body;
  const session = readSessionFromRequest(req);
  const user = (body.user ?? session?.email ?? "anonymous").toString().slice(0, 80);

  if (!paper_id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { ok: false, error: "missing paper_id or invalid action" },
      { status: 400 },
    );
  }
  // API token grants editor privileges + supplies the audit attribution.
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
  const limit = await rateLimit({
    apiTokenAttribution: tokenAttribution,
    email: session?.email,
    alias: user,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limit_exceeded", retry_after_ms: limit.retry_after_ms },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }
  const records = await loadCustomCorpus();
  const idx = records.findIndex((r) => r.paper.id === paper_id);
  if (idx < 0) {
    return NextResponse.json({ ok: false, error: "paper not found" }, { status: 404 });
  }
  const reviewedAt = new Date().toISOString();
  const actor = tokenAttribution ?? session?.email ?? user;
  records[idx] = {
    ...records[idx],
    status: action === "approve" ? "approved" : "rejected",
    reviewed_by: actor,
    reviewed_at: reviewedAt,
    review_note: body.note?.slice(0, 400),
  };
  await saveCustomCorpus(records);

  // Append-only audit log — best-effort so a Drive hiccup never blocks
  // the actual review write.
  appendAudit({
    at: reviewedAt,
    actor,
    action,
    paper_ids: [paper_id],
    note: body.note?.slice(0, 200),
    source: "single",
  }).catch((err) => console.warn("audit append failed:", err));

  return NextResponse.json({
    ok: true,
    state_file: CUSTOM_CORPUS_STATE,
    record: records[idx],
  });
}
