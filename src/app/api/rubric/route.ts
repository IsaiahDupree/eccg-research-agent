import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/auth/session";
import { isEditor, isEditorsEnforced, listEditors, listEditorEmails } from "@/lib/editors";
import { readState, writeState } from "@/lib/google/state";
import { DEFAULT_RUBRIC } from "@/lib/scoring/weights";

const STATE_NAME = "rubric-weights";

interface WeightsRecord {
  weights: Record<string, number>;
  updated_by?: string;
  updated_at?: string;
}

export const runtime = "nodejs";

export async function GET() {
  const stored = await readState<WeightsRecord | null>(STATE_NAME, null);
  const defaults = Object.fromEntries(
    DEFAULT_RUBRIC.categories.map((c) => [c.name, c.weight]),
  );
  return NextResponse.json({
    weights: { ...defaults, ...(stored?.weights ?? {}) },
    updated_by: stored?.updated_by ?? null,
    updated_at: stored?.updated_at ?? null,
    editors_enforced: isEditorsEnforced(),
    editors: listEditors(),
    editor_emails: listEditorEmails(),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<WeightsRecord> & {
    user?: string;
  };
  const session = readSessionFromRequest(req);
  const alias = (body.user ?? session?.email ?? "anonymous").toString().slice(0, 80);
  if (!isEditor(alias, session?.email)) {
    return NextResponse.json(
      {
        ok: false,
        error: `'${alias}' is not on the editor allowlist`,
        editors: listEditors(),
        editor_emails: listEditorEmails(),
      },
      { status: 403 },
    );
  }
  const raw = body.weights ?? {};
  const clean: Record<string, number> = {};
  for (const c of DEFAULT_RUBRIC.categories) {
    const v = Number((raw as Record<string, unknown>)[c.name]);
    clean[c.name] = Number.isFinite(v) && v >= 0 && v <= 50 ? v : c.weight;
  }
  const record: WeightsRecord = {
    weights: clean,
    updated_by: session?.email ?? alias,
    updated_at: new Date().toISOString(),
  };
  await writeState(STATE_NAME, record);
  return NextResponse.json({ ok: true, ...record });
}
