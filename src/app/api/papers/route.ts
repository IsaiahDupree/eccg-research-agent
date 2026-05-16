import { NextResponse } from "next/server";
import { loadSeedPipeline } from "@/lib/seed";

export const runtime = "nodejs";

export async function GET() {
  const result = loadSeedPipeline();
  return NextResponse.json({
    niche: result.niche,
    count: result.scored.length,
    papers: result.scored.map((s) => ({
      id: s.paper.id,
      title: s.paper.title,
      authors: s.paper.authors,
      venue: s.paper.venue?.name,
      published_at: s.paper.published_at,
      score: s.total,
      citations: s.paper.citation_count,
      cpm: s.paper.citations_per_month,
      category: s.paper.eccg_category,
      arxiv_id: s.paper.arxiv_id,
    })),
  });
}
