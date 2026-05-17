/**
 * GET /api/library/export?format=bibtex|json
 *
 * Streams the team library as BibTeX (default) or JSON for use in tools
 * that don't have direct access to the browser-side library state.
 *
 *   curl -s https://eccg-research-agent.vercel.app/api/library/export > library.bib
 */

import { NextResponse } from "next/server";
import { toBibtex } from "@/lib/bibtex";
import { loadCustomCorpus, statusOf } from "@/lib/custom_corpus";
import { loadSeedPipeline } from "@/lib/seed";
import { readState } from "@/lib/google/state";

export const runtime = "nodejs";

interface LibraryItem {
  paper_id: string;
  added_by: string;
  added_at: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "bibtex").toLowerCase();

  const items = await readState<LibraryItem[]>("library", []);
  const result = loadSeedPipeline();
  const byId = new Map(result.scored.map((s) => [s.paper.id, s.paper]));

  const customCorpus = await loadCustomCorpus();
  for (const r of customCorpus) {
    if (statusOf(r) === "approved" && !byId.has(r.paper.id)) {
      byId.set(r.paper.id, r.paper);
    }
  }

  const papers = items
    .map((i) => byId.get(i.paper_id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  if (format === "json") {
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      count: papers.length,
      missing: items.length - papers.length,
      papers,
    });
  }

  if (format !== "bibtex") {
    return NextResponse.json(
      { ok: false, error: `unsupported format '${format}' (use bibtex or json)` },
      { status: 400 },
    );
  }

  const header = `% ECCG team library — ${papers.length} papers, generated ${new Date().toISOString()}\n% https://eccg-research-agent.vercel.app/library\n\n`;
  const body = toBibtex(papers);
  return new NextResponse(header + body, {
    status: 200,
    headers: {
      "content-type": "application/x-bibtex; charset=utf-8",
      "content-disposition": `attachment; filename="eccg-library-${new Date().toISOString().slice(0, 10)}.bib"`,
    },
  });
}
