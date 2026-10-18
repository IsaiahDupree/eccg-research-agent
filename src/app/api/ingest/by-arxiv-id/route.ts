/**
 * POST /api/ingest/by-arxiv-id { arxiv_id, user? }
 *
 * Pulls a single paper by its arXiv id straight into the custom corpus as
 * `approved` (editorial pull-in, so it skips /review). Driven from the
 * /gaps page so editors can fill coverage holes with one click.
 *
 * Editor-gated. Bypasses the standard event-camera keyword filter — gaps
 * often live in adjacent domains (CV/SLAM/robotics) the team intentionally
 * wants to import.
 */

import { NextResponse } from "next/server";
import { assignRelevance } from "@/lib/analysis/relevance";
import { readSessionFromRequest } from "@/lib/auth/session";
import {
  CUSTOM_CORPUS_STATE,
  loadCustomCorpus,
  saveCustomCorpus,
  type UploadedRecord,
} from "@/lib/custom_corpus";
import {
  isEditor,
  isEditorsEnforced,
  listEditors,
  listEditorEmails,
  readApiTokenAttribution,
} from "@/lib/editors";
import { fetchArxivPaperById } from "@/lib/sources/arxiv";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    arxiv_id?: string;
    user?: string;
    note?: string;
  };

  const arxivId = body.arxiv_id?.toString().trim();
  if (!arxivId) {
    return NextResponse.json(
      { ok: false, error: "missing arxiv_id" },
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

  const paper = await fetchArxivPaperById(arxivId);
  if (!paper) {
    return NextResponse.json(
      { ok: false, error: `arXiv id '${arxivId}' not found` },
      { status: 404 },
    );
  }

  assignRelevance([paper]);

  const records = await loadCustomCorpus();
  const existing = records.find((r) => r.paper.id === paper.id);
  if (existing) {
    return NextResponse.json({
      ok: true,
      already_present: true,
      status: existing.status ?? "approved",
      paper,
    });
  }

  const now = new Date().toISOString();
  const reviewer = tokenAttribution ?? session?.email ?? user;
  const record: UploadedRecord = {
    paper,
    score_base:
      (paper.eccg_relevance ?? 0) * 55 +
      Math.exp(-paper.months_since_publish / 12) * 35,
    uploaded_by: tokenAttribution ?? user,
    uploaded_at: now,
    source_file: "gap-ingest",
    status: "approved",
    reviewed_by: reviewer,
    reviewed_at: now,
    review_note: body.note?.slice(0, 400) ?? "Pulled from coverage-gap list",
  };
  await saveCustomCorpus([record, ...records]);

  return NextResponse.json({
    ok: true,
    state_file: CUSTOM_CORPUS_STATE,
    paper,
    score_base: record.score_base,
    category: paper.eccg_category,
    relevance: paper.eccg_relevance,
  });
}
