import { NextResponse } from "next/server";
import {
  loadCollab,
  saveLibrary,
  type CollabLibraryItem,
  type ReadingStatus,
} from "@/lib/collab";
import { rateLimit, rateLimitHeaders } from "@/lib/ratelimit";

export const runtime = "nodejs";

const READING_STATUSES: ReadingStatus[] = ["to_read", "reading", "read"];

function clampTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of input) {
    if (typeof t !== "string") continue;
    const clean = t.trim().toLowerCase().slice(0, 32);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

export async function GET() {
  const { library } = await loadCollab();
  return NextResponse.json({ library });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<{
    action: "add" | "remove" | "update";
    paper_id: string;
    user: string;
    tags: string[];
    reading_status: ReadingStatus;
  }>;
  const { action, paper_id } = body;
  const user = (body.user || "anonymous").slice(0, 40);
  if (!action || !paper_id) {
    return NextResponse.json({ ok: false, error: "missing action or paper_id" }, { status: 400 });
  }
  const limit = await rateLimit({ alias: user });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limit_exceeded", retry_after_ms: limit.retry_after_ms },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }
  const { library } = await loadCollab();
  let next: CollabLibraryItem[];
  const now = new Date().toISOString();
  if (action === "add") {
    if (library.some((l) => l.paper_id === paper_id)) {
      return NextResponse.json({ ok: true, library, already_present: true });
    }
    next = [
      {
        paper_id,
        added_by: user,
        added_at: now,
        tags: clampTags(body.tags),
        reading_status: body.reading_status,
        status_updated_at: body.reading_status ? now : undefined,
      },
      ...library,
    ];
  } else if (action === "update") {
    const idx = library.findIndex((l) => l.paper_id === paper_id);
    if (idx < 0) {
      return NextResponse.json({ ok: false, error: "paper_id not in library" }, { status: 404 });
    }
    const updated: CollabLibraryItem = { ...library[idx] };
    if (body.tags !== undefined) updated.tags = clampTags(body.tags);
    if (body.reading_status !== undefined) {
      if (!READING_STATUSES.includes(body.reading_status)) {
        return NextResponse.json(
          { ok: false, error: `invalid reading_status` },
          { status: 400 },
        );
      }
      updated.reading_status = body.reading_status;
      updated.status_updated_at = now;
    }
    next = [...library];
    next[idx] = updated;
  } else {
    next = library.filter((l) => l.paper_id !== paper_id);
  }
  await saveLibrary(next);
  return NextResponse.json(
    { ok: true, library: next },
    { headers: rateLimitHeaders(limit) },
  );
}
