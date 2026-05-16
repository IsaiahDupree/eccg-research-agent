import { NextResponse } from "next/server";
import { loadCollab, saveNotes, type CollabNote } from "@/lib/collab";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ paperId: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { paperId } = await params;
  const decoded = decodeURIComponent(paperId);
  const { notes } = await loadCollab();
  return NextResponse.json({ paper_id: decoded, notes: notes[decoded] ?? [] });
}

export async function POST(req: Request, { params }: Ctx) {
  const { paperId } = await params;
  const decoded = decodeURIComponent(paperId);
  const body = (await req.json().catch(() => ({}))) as Partial<{
    body: string;
    author: string;
  }>;
  const text = (body.body ?? "").trim().slice(0, 4000);
  const author = (body.author ?? "anonymous").trim().slice(0, 40) || "anonymous";
  if (!text) {
    return NextResponse.json({ ok: false, error: "empty note" }, { status: 400 });
  }
  const { notes } = await loadCollab();
  const next: CollabNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    paper_id: decoded,
    author,
    body: text,
    created_at: new Date().toISOString(),
  };
  const list = notes[decoded] ?? [];
  const updated = { ...notes, [decoded]: [...list, next] };
  await saveNotes(updated);
  return NextResponse.json({ ok: true, note: next, count: updated[decoded].length });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { paperId } = await params;
  const decoded = decodeURIComponent(paperId);
  const { searchParams } = new URL(req.url);
  const noteId = searchParams.get("note_id");
  if (!noteId) {
    return NextResponse.json({ ok: false, error: "missing note_id" }, { status: 400 });
  }
  const { notes } = await loadCollab();
  const list = notes[decoded] ?? [];
  const next = list.filter((n) => n.id !== noteId);
  const updated = { ...notes, [decoded]: next };
  await saveNotes(updated);
  return NextResponse.json({ ok: true, count: next.length });
}
