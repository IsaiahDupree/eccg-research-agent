import { buildRssFeed } from "@/lib/rss";
import { loadSeedPipeline } from "@/lib/seed";
import { TAXONOMY } from "@/lib/taxonomy";

export const runtime = "nodejs";
export const revalidate = 600;

const SITE_URL = process.env.SITE_URL ?? "https://eccg-research-agent.vercel.app";
const VALID_SLUGS = new Set(TAXONOMY.map((t) => t.slug));

interface Ctx {
  params: Promise<{ category: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { category } = await params;
  const slug = category.replace(/\.xml$/, "");
  if (!VALID_SLUGS.has(slug)) {
    return new Response(`Unknown category: ${slug}`, { status: 404 });
  }
  const { scored } = loadSeedPipeline();
  const filtered = scored
    .filter((s) => s.paper.eccg_category === slug)
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);
  const label = TAXONOMY.find((t) => t.slug === slug)?.label ?? slug;
  const xml = buildRssFeed(filtered, {
    title: `ECCG Research — ${label}`,
    description: `Top ${filtered.length} ${label} papers from the ECCG Research Agent.`,
    siteUrl: SITE_URL,
    feedPath: `/feed/${slug}.xml`,
  });
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}
