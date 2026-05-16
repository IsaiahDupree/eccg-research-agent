import { NextResponse } from "next/server";
import { loadCollab, saveLibrary, type CollabLibraryItem } from "@/lib/collab";

export const runtime = "nodejs";

export async function GET() {
  const { library } = await loadCollab();
  return NextResponse.json({ library });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<{
    action: "add" | "remove";
    paper_id: string;
    user: string;
    tags: string[];
  }>;
  const { action, paper_id } = body;
  const user = (body.user || "anonymous").slice(0, 40);
  if (!action || !paper_id) {
    return NextResponse.json({ ok: false, error: "missing action or paper_id" }, { status: 400 });
  }
  const { library } = await loadCollab();
  let next: CollabLibraryItem[];
  if (action === "add") {
    if (library.some((l) => l.paper_id === paper_id)) {
      return NextResponse.json({ ok: true, library, already_present: true });
    }
    next = [
      { paper_id, added_by: user, added_at: new Date().toISOString(), tags: body.tags ?? [] },
      ...library,
    ];
  } else {
    next = library.filter((l) => l.paper_id !== paper_id);
  }
  await saveLibrary(next);
  return NextResponse.json({ ok: true, library: next });
}
