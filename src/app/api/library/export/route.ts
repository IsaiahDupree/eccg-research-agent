/**
 * GET /api/library/export?format=bibtex|csv|json
 *
 * Streams the team library as BibTeX (default), CSV, or JSON for use in
 * tools that don't have direct access to the browser-side library state.
 *
 *   curl -s https://eccg-research-agent.vercel.app/api/library/export > library.bib
 *   curl -s https://eccg-research-agent.vercel.app/api/library/export?format=csv > library.csv
 */

import { NextResponse } from "next/server";
import { toBibtex } from "@/lib/bibtex";
import { toCsv } from "@/lib/csv";
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

  if (format === "csv") {
    const header = [
      "id",
      "title",
      "authors",
      "venue",
      "venue_type",
      "year",
      "citation_count",
      "category",
      "arxiv_id",
      "doi",
      "url",
    ];
    const rows: (string | number | null | undefined)[][] = [header];
    for (const p of papers) {
      rows.push([
        p.id,
        p.title,
        p.authors.map((a) => a.name).join("; "),
        p.venue?.name ?? "",
        p.venue?.type ?? "",
        new Date(p.published_at).getFullYear(),
        p.citation_count,
        p.eccg_category ?? "",
        p.arxiv_id ?? "",
        p.doi ?? "",
        p.html_url ?? p.pdf_url ?? "",
      ]);
    }
    return new NextResponse(toCsv(rows), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="eccg-library-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (format !== "bibtex") {
    return NextResponse.json(
      { ok: false, error: `unsupported format '${format}' (use bibtex, csv, or json)` },
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
