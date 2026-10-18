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
import { fetchWithRetry } from "../fetch_retry";
import type { Paper, Niche } from "../models";
import { isLikelyEventCameraPaper, ECCG_CORE_KEYWORDS } from "../taxonomy";

const ARXIV_API = "https://export.arxiv.org/api/query";
const DEFAULT_CATS = ["cs.CV", "cs.RO", "cs.NE"];

function buildSearchQuery(cats: string[], keywords: readonly string[]): string {
  // arXiv search_query syntax: cat:cs.CV AND (abs:"event camera" OR abs:"event-based" OR ...)
  const catClause = cats.map((c) => `cat:${c}`).join(" OR ");
  const kwClause = keywords.map((k) => `abs:"${k}"`).join(" OR ");
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
  /** Keyword filter for the search_query — defaults to event-camera core terms. */
  keywords?: readonly string[];
  maxResults?: number;
  start?: number;
  sortBy?: "submittedDate" | "lastUpdatedDate" | "relevance";
}

export async function fetchArxivPapers(opts: ArxivFetchOpts = {}): Promise<Paper[]> {
  const {
    niche = "event_camera",
    categories = DEFAULT_CATS,
    keywords = ECCG_CORE_KEYWORDS,
    maxResults = 50,
    start = 0,
    sortBy = "submittedDate",
  } = opts;

  const params = new URLSearchParams({
    search_query: buildSearchQuery(categories, keywords),
    start: String(start),
    max_results: String(maxResults),
    sortBy,
    sortOrder: "descending",
  });

  const url = `${ARXIV_API}?${params}`;
  const cacheKey = { url, niche };

  return withCache("arxiv", cacheKey, async () => {
    const res = await fetchWithRetry(
      url,
      { headers: { "User-Agent": "eccg-research-agent/0.1 (mailto:isaiahdupree33@gmail.com)" } },
      {
        maxAttempts: 4,
        baseMs: 1000,
        onRetry: (n, reason, wait) =>
          console.warn(`[arxiv] retry ${n} after ${reason} — waiting ${wait}ms`),
      },
    );
    if (!res.ok) {
      throw new Error(`arXiv API ${res.status}: ${res.statusText}`);
    }
    const xml = await res.text();
    const parsed = parser.parse(xml) as { feed?: { entry?: ArxivAtomEntry | ArxivAtomEntry[] } };
    const entries = asArray(parsed.feed?.entry);
    const filter =
      niche === "event_camera"
        ? (p: Paper) => isLikelyEventCameraPaper(`${p.title} ${p.abstract}`)
        : (p: Paper) => {
            const text = `${p.title} ${p.abstract}`.toLowerCase();
            return keywords.some((k) => text.includes(k.toLowerCase()));
          };
    return entries.map(entryToPaper).filter(filter);
  });
}

// Test-only helper: parse raw XML into Paper[] without making a network call.
export function parseArxivXml(xml: string): Paper[] {
  const parsed = parser.parse(xml) as { feed?: { entry?: ArxivAtomEntry | ArxivAtomEntry[] } };
  const entries = asArray(parsed.feed?.entry);
  return entries.map(entryToPaper);
}

/**
 * Fetch a single paper by its arXiv id (e.g. "2402.18221" — strip the `arxiv-`
 * prefix and any version suffix first). Used by /api/ingest/by-arxiv-id for
 * the gap-ingest button. Bypasses the keyword filter, since the caller is
 * explicitly pulling this in — even if it's a cross-domain reference.
 */
export async function fetchArxivPaperById(arxivId: string): Promise<Paper | null> {
  const cleanId = arxivId.replace(/^arxiv[-:]/i, "").replace(/v\d+$/i, "");
  const params = new URLSearchParams({ id_list: cleanId, max_results: "1" });
  const url = `${ARXIV_API}?${params}`;
  const res = await fetchWithRetry(
    url,
    { headers: { "User-Agent": "eccg-research-agent/0.1 (mailto:isaiahdupree33@gmail.com)" } },
    { maxAttempts: 3, baseMs: 1000 },
  );
  if (!res.ok) return null;
  const xml = await res.text();
  const parsed = parser.parse(xml) as { feed?: { entry?: ArxivAtomEntry | ArxivAtomEntry[] } };
  const entries = asArray(parsed.feed?.entry);
  if (entries.length === 0) return null;
  return entryToPaper(entries[0]);
}
