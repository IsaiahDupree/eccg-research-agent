/**
 * arXiv source.
 *
 * Uses the public arXiv Atom API: http://export.arxiv.org/api/query
 * No API key needed. Politeness: arXiv asks for <= 1 request/3s.
 *
 * We query the cs.CV, cs.RO, cs.NE categories with a keyword filter for
 * event-camera terms. Returns normalised Paper[].
 */

import { XMLParser } from "fast-xml-parser";
import { withCache } from "../cache";
import type { Paper, Niche } from "../models";
import { isLikelyEventCameraPaper, ECCG_CORE_KEYWORDS } from "../taxonomy";

const ARXIV_API = "https://export.arxiv.org/api/query";
const DEFAULT_CATS = ["cs.CV", "cs.RO", "cs.NE"];

function buildSearchQuery(niche: Niche, cats: string[]): string {
  // arXiv search_query syntax: cat:cs.CV AND (abs:"event camera" OR abs:"event-based" OR ...)
  const catClause = cats.map((c) => `cat:${c}`).join(" OR ");
  const kwClause = ECCG_CORE_KEYWORDS.map((k) => `abs:"${k}"`).join(" OR ");
  // For non-ECCG niches we'd swap kwClause; V1 just hardcodes event-camera terms.
  void niche;
  return `(${catClause}) AND (${kwClause})`;
}

interface ArxivAtomEntry {
  id: string;                     // "http://arxiv.org/abs/2401.12345v1"
  title: string;
  summary: string;
  published: string;              // ISO date
  updated: string;
  author: { name: string } | { name: string }[];
  category: { "@_term": string } | { "@_term": string }[];
  link:
    | { "@_href": string; "@_rel": string; "@_type"?: string }
    | { "@_href": string; "@_rel": string; "@_type"?: string }[];
  "arxiv:primary_category"?: { "@_term": string };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseArxivId(idUrl: string): string {
  // "http://arxiv.org/abs/2401.12345v1" -> "2401.12345"
  const m = idUrl.match(/abs\/([^v]+)(?:v\d+)?$/);
  return m ? m[1] : idUrl;
}

function entryToPaper(e: ArxivAtomEntry): Paper {
  const arxiv_id = parseArxivId(e.id);
  const authors = asArray(e.author).map((a) => ({ name: a.name }));
  const categories = asArray(e.category).map((c) => c["@_term"]);
  const pdfLink = asArray(e.link).find(
    (l) => l["@_type"] === "application/pdf" || l["@_rel"] === "related",
  );
  const htmlLink = asArray(e.link).find((l) => l["@_rel"] === "alternate");
  const published = new Date(e.published);
  const monthsSince = Math.max(
    0,
    (Date.now() - published.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );
  return {
    id: `arxiv-${arxiv_id}`,
    arxiv_id,
    title: e.title.replace(/\s+/g, " ").trim(),
    abstract: e.summary.replace(/\s+/g, " ").trim(),
    authors,
    venue: { name: "arXiv preprint", type: "preprint" },
    published_at: published.toISOString(),
    categories,
    pdf_url: pdfLink?.["@_href"],
    html_url: htmlLink?.["@_href"],
    citation_count: 0,           // populated by Semantic Scholar later
    months_since_publish: monthsSince,
    citations_per_month: 0,
  };
}

export interface ArxivFetchOpts {
  niche?: Niche;
  categories?: string[];
  maxResults?: number;
  start?: number;
  sortBy?: "submittedDate" | "lastUpdatedDate" | "relevance";
}

export async function fetchArxivPapers(opts: ArxivFetchOpts = {}): Promise<Paper[]> {
  const {
    niche = "event_camera",
    categories = DEFAULT_CATS,
    maxResults = 50,
    start = 0,
    sortBy = "submittedDate",
  } = opts;

  const params = new URLSearchParams({
    search_query: buildSearchQuery(niche, categories),
    start: String(start),
    max_results: String(maxResults),
    sortBy,
    sortOrder: "descending",
  });

  const url = `${ARXIV_API}?${params}`;
  const cacheKey = { url, niche };

  return withCache("arxiv", cacheKey, async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": "eccg-research-agent/0.1 (mailto:isaiahdupree33@gmail.com)" },
    });
    if (!res.ok) {
      throw new Error(`arXiv API ${res.status}: ${res.statusText}`);
    }
    const xml = await res.text();
    const parsed = parser.parse(xml) as { feed?: { entry?: ArxivAtomEntry | ArxivAtomEntry[] } };
    const entries = asArray(parsed.feed?.entry);
    return entries
      .map(entryToPaper)
      // Defensive: even though we filtered server-side, sanity-check
      .filter((p) => isLikelyEventCameraPaper(`${p.title} ${p.abstract}`));
  });
}

// Test-only helper: parse raw XML into Paper[] without making a network call.
export function parseArxivXml(xml: string): Paper[] {
  const parsed = parser.parse(xml) as { feed?: { entry?: ArxivAtomEntry | ArxivAtomEntry[] } };
  const entries = asArray(parsed.feed?.entry);
  return entries.map(entryToPaper);
}
