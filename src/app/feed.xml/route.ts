import { buildRssFeed } from "@/lib/rss";
import { loadSeedPipeline } from "@/lib/seed";

export const runtime = "nodejs";
export const revalidate = 600; // 10 minutes

const SITE_URL = process.env.SITE_URL ?? "https://eccg-research-agent.vercel.app";

export async function GET() {
  const { scored } = loadSeedPipeline();
  const top = [...scored].sort((a, b) => b.total - a.total).slice(0, 50);
  const xml = buildRssFeed(top, {
    title: "ECCG Research — Top papers",
    description:
      "Top 50 ranked event-camera research papers from the ECCG Research Agent. Updated every 10 minutes.",
    siteUrl: SITE_URL,
    feedPath: "/feed.xml",
  });
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}
