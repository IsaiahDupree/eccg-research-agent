import { NextResponse } from "next/server";
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
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<WeightsRecord> & {
    user?: string;
  };
  const raw = body.weights ?? {};
  const clean: Record<string, number> = {};
  for (const c of DEFAULT_RUBRIC.categories) {
    const v = Number((raw as Record<string, unknown>)[c.name]);
    clean[c.name] = Number.isFinite(v) && v >= 0 && v <= 50 ? v : c.weight;
  }
  const record: WeightsRecord = {
    weights: clean,
    updated_by: (body.user ?? "anonymous").toString().slice(0, 40),
    updated_at: new Date().toISOString(),
  };
  await writeState(STATE_NAME, record);
  return NextResponse.json({ ok: true, ...record });
}
