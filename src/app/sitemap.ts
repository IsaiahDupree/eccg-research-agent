import type { MetadataRoute } from "next";
import { loadSeedPipeline } from "@/lib/seed";
import { loadSeedMeetings } from "@/lib/seed_meetings";
import { NICHES } from "@/lib/niches";

const BASE = process.env.SITE_URL?.trim() || "https://eccg-research-agent.vercel.app";

/**
 * Full sitemap covering every meaningful URL on the site:
 *   - static pages (/, /leaderboard, /library, …)
 *   - per-niche home pages (/n/*)
 *   - every paper (/paper/*)
 *   - every meeting (/meetings/*)
 *   - prolific authors (/author/*) — capped at 200 to stay under search
 *     engine sitemap soft limits while still covering the long tail of
 *     active corpus contributors.
 *
 * URLs are emitted with `lastModified` so crawl prioritisation reflects
 * actual freshness rather than treating every page as ancient or new.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/influential`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/whats-new`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/categories`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/institutions`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/gaps`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/timeline`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/map`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/meetings`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/library`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/learn`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/search`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const nicheRoutes: MetadataRoute.Sitemap = NICHES.map((n) => ({
    url: `${BASE}/n/${n.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const result = loadSeedPipeline();

  const paperRoutes: MetadataRoute.Sitemap = result.scored.map((s) => ({
    url: `${BASE}/paper/${encodeURIComponent(s.paper.id)}`,
    lastModified: s.paper.published_at ? new Date(s.paper.published_at) : now,
    changeFrequency: "monthly" as const,
    priority: s.total >= 80 ? 0.9 : s.total >= 60 ? 0.7 : 0.5,
  }));

  // Author pages: only authors with ≥ 3 papers in the corpus get a
  // sitemap entry. Below that threshold the page is functionally a stub
  // and not worth Google's crawl budget.
  const authorCounts = new Map<string, number>();
  for (const s of result.scored) {
    for (const a of s.paper.authors) {
      authorCounts.set(a.name, (authorCounts.get(a.name) ?? 0) + 1);
    }
  }
  const authorRoutes: MetadataRoute.Sitemap = Array.from(authorCounts.entries())
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([name]) => ({
      url: `${BASE}/author/${encodeURIComponent(name)}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  const meetings = loadSeedMeetings();
  const meetingRoutes: MetadataRoute.Sitemap = meetings.map((m) => ({
    url: `${BASE}/meetings/${m.id}`,
    lastModified: new Date(m.held_at),
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));

  return [
    ...staticRoutes,
    ...nicheRoutes,
    ...paperRoutes,
    ...authorRoutes,
    ...meetingRoutes,
  ];
}
