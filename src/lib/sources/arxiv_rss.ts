/**
 * arXiv RSS source — daily category feeds that don't go through the search
 * API. Faster than `/api/query` and not rate-limited the same way (each feed
 * is just a static-ish XML file).
 *
 * arXiv publishes per-category Atom feeds at:
 *    https://rss.arxiv.org/atom/<category>
 *
 * Returns *all* recently-announced papers in the category, no keyword
 * filter. We post-filter using the same `isLikelyEventCameraPaper` check
 * the search-based ingest uses, so the output shape matches `fetchArxivPapers`.
 */

import { XMLParser } from "fast-xml-parser";
import type { Paper, Niche } from "../models";
import { isLikelyEventCameraPaper } from "../taxonomy";

const RSS_BASE = "https://rss.arxiv.org/atom";
const DEFAULT_CATS = ["cs.CV", "cs.RO", "cs.NE"];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseArxivId(idUrl: string): string {
  const m = idUrl.match(/abs\/([^v]+)(?:v\d+)?$/) || idUrl.match(/([0-9]{4}\.[0-9]{4,5})/);
  return m ? m[1] : idUrl;
}

interface AtomEntry {
  id: string;
  title: string | { "#text"?: string };
  summary: string | { "#text"?: string };
  published?: string;
  updated?: string;
  author?: { name: string } | { name: string }[];
  category?: { "@_term": string } | { "@_term": string }[];
  link?:
    | { "@_href": string; "@_rel"?: string; "@_type"?: string }
    | { "@_href": string; "@_rel"?: string; "@_type"?: string }[];
}

function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "#text" in v) return String((v as { "#text"?: string })["#text"] ?? "");
  return "";
}

function entryToPaper(e: AtomEntry): Paper | null {
  const idUrl = e.id;
  if (!idUrl) return null;
  const arxiv_id = parseArxivId(idUrl);
  const title = textOf(e.title).replace(/\s+/g, " ").trim();
  const abstract = textOf(e.summary).replace(/\s+/g, " ").trim();
  if (!title || !arxiv_id) return null;
  const authors = asArray(e.author).map((a) => ({ name: a.name }));
  const categories = asArray(e.category).map((c) => c["@_term"]);
  const links = asArray(e.link);
  const pdf = links.find((l) => l["@_type"] === "application/pdf");
  const html = links.find((l) => l["@_rel"] === "alternate");
  const publishedAt = new Date(e.published ?? e.updated ?? Date.now());
  const months = Math.max(
    0,
    (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );
  return {
    id: `arxiv-${arxiv_id}`,
    arxiv_id,
    title,
    abstract,
    authors,
    venue: { name: "arXiv preprint", type: "preprint" },
    published_at: publishedAt.toISOString(),
    categories,
    pdf_url: pdf?.["@_href"],
    html_url: html?.["@_href"] ?? `https://arxiv.org/abs/${arxiv_id}`,
    citation_count: 0,
    months_since_publish: months,
    citations_per_month: 0,
  };
}

export interface ArxivRssOpts {
  niche?: Niche;
  categories?: string[];
}

export async function fetchArxivRssPapers(opts: ArxivRssOpts = {}): Promise<Paper[]> {
  void opts.niche; // current niche is fixed to event-camera in the filter
  const cats = opts.categories ?? DEFAULT_CATS;
  const collected: Paper[] = [];
  const seen = new Set<string>();
  for (const cat of cats) {
    try {
      const res = await fetch(`${RSS_BASE}/${cat}`, {
        headers: {
          Accept: "application/atom+xml,application/xml,text/xml,*/*",
          "User-Agent": "eccg-research-agent/1.0 (mailto:isaiahdupree33@gmail.com)",
        },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = parser.parse(xml) as {
        feed?: { entry?: AtomEntry | AtomEntry[] };
      };
      for (const e of asArray(parsed.feed?.entry)) {
        const paper = entryToPaper(e);
        if (!paper || seen.has(paper.id)) continue;
        if (!isLikelyEventCameraPaper(`${paper.title} ${paper.abstract}`)) continue;
        seen.add(paper.id);
        collected.push(paper);
      }
    } catch {
      // skip category on failure
    }
  }
  return collected;
}
