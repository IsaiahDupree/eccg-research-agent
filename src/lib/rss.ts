/**
 * Build a valid RSS 2.0 feed of papers. Pure function — no IO.
 */

import type { ScoredPaper } from "./models";

export interface FeedOptions {
  title: string;
  description: string;
  siteUrl: string;          // canonical base, e.g. https://eccg-research-agent.vercel.app
  feedPath: string;         // e.g. /feed.xml
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdataSafe(s: string): string {
  // RSS allows <![CDATA[…]]> blocks. Escape the closing token if it slips in.
  return s.replace(/]]>/g, "]]&gt;");
}

export function buildRssFeed(papers: ScoredPaper[], opts: FeedOptions): string {
  const now = new Date().toUTCString();
  const items = papers
    .map((s) => {
      const p = s.paper;
      const link = `${opts.siteUrl}/paper/${encodeURIComponent(p.id)}`;
      const pub = new Date(p.published_at).toUTCString();
      const authors = p.authors.map((a) => a.name).join(", ");
      const cat = p.eccg_category ? `<category>${escape(p.eccg_category)}</category>` : "";
      const venue = p.venue?.name ? ` · ${escape(p.venue.name)}` : "";
      const abstract = cdataSafe(p.abstract).slice(0, 1200);
      const description = `<p><strong>Score ${s.total.toFixed(0)}/100</strong>${venue} · authors: ${escape(authors)}</p><p>${abstract}</p>`;
      const arxiv = p.html_url
        ? `<link>${escape(p.html_url)}</link>`
        : `<link>${escape(link)}</link>`;
      return `    <item>
      <title>${escape(p.title)}</title>
      ${arxiv}
      <guid isPermaLink="false">${escape(p.id)}</guid>
      <pubDate>${pub}</pubDate>
      <author>${escape(authors)}</author>
      ${cat}
      <description><![CDATA[${description}]]></description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(opts.title)}</title>
    <link>${escape(opts.siteUrl)}</link>
    <atom:link href="${escape(opts.siteUrl + opts.feedPath)}" rel="self" type="application/rss+xml"/>
    <description>${escape(opts.description)}</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
${items}
  </channel>
</rss>`;
}
