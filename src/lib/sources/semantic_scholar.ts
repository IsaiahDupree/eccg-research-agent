/**
 * Semantic Scholar source.
 *
 * Public API: https://api.semanticscholar.org/graph/v1
 * Anonymous: 100 req / 5 min. With key: higher.
 *
 * V1 use cases:
 *   - hydratePaper(arxiv_id) — fetch citationCount, influentialCitationCount,
 *     venue, fieldsOfStudy for a paper we already discovered on arXiv.
 *   - relatedPapers(paper_id) — recommendations (V1.1).
 */

import { withCache } from "../cache";
import { fetchWithRetry } from "../fetch_retry";
import type { Paper } from "../models";

const S2_API = "https://api.semanticscholar.org/graph/v1";

interface S2Paper {
  paperId: string;
  externalIds?: { ArXiv?: string; DOI?: string };
  title?: string;
  abstract?: string;
  year?: number;
  venue?: string;
  publicationVenue?: { name?: string; type?: string };
  citationCount?: number;
  influentialCitationCount?: number;
  authors?: { authorId?: string; name: string; hIndex?: number }[];
  fieldsOfStudy?: string[];
}

const FIELDS = [
  "paperId",
  "externalIds",
  "title",
  "abstract",
  "year",
  "venue",
  "publicationVenue",
  "citationCount",
  "influentialCitationCount",
  "authors.name",
  "authors.hIndex",
  "fieldsOfStudy",
].join(",");

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "eccg-research-agent/0.1",
  };
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    h["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }
  return h;
}

export async function fetchS2ByArxivId(arxivId: string): Promise<S2Paper | null> {
  const url = `${S2_API}/paper/ARXIV:${encodeURIComponent(arxivId)}?fields=${FIELDS}`;
  return withCache("s2", { url }, async () => {
    const res = await fetchWithRetry(
      url,
      { headers: headers() },
      {
        maxAttempts: 4,
        baseMs: 1500,
        // S2's anonymous tier 429s hard — give it generous backoff.
        onRetry: (n, reason, wait) =>
          console.warn(`[s2] retry ${n} after ${reason} — waiting ${wait}ms`),
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S2 API ${res.status}: ${res.statusText}`);
    return (await res.json()) as S2Paper;
  });
}

/**
 * Hydrate an array of Papers in place by enriching with Semantic Scholar fields.
 * Calls S2 once per paper that has an arxiv_id. Failures are swallowed — a paper
 * without citation data still scores, just lower.
 */
export async function hydrateWithS2(papers: Paper[]): Promise<void> {
  const concurrency = 4; // be polite
  let i = 0;
  async function worker(): Promise<void> {
    while (i < papers.length) {
      const idx = i++;
      const p = papers[idx];
      if (!p.arxiv_id) continue;
      try {
        const s2 = await fetchS2ByArxivId(p.arxiv_id);
        if (!s2) continue;
        p.s2_id = s2.paperId;
        p.doi = s2.externalIds?.DOI ?? p.doi;
        p.citation_count = s2.citationCount ?? 0;
        p.influential_citation_count = s2.influentialCitationCount;
        if (p.months_since_publish > 0) {
          p.citations_per_month = p.citation_count / p.months_since_publish;
        }
        if (s2.publicationVenue?.name && p.venue?.type === "preprint") {
          // Promote venue if S2 sees a venue-of-record
          p.venue = {
            name: s2.publicationVenue.name,
            type: classifyVenueType(s2.publicationVenue.type ?? "", s2.publicationVenue.name),
          };
        }
        // merge author h_index
        if (s2.authors && p.authors.length) {
          const byName = new Map(s2.authors.map((a) => [a.name, a.hIndex]));
          p.authors = p.authors.map((a) => ({
            ...a,
            h_index: byName.get(a.name),
          }));
        }
      } catch {
        // ignore individual failure
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

function classifyVenueType(
  rawType: string,
  name: string,
): "conference" | "journal" | "preprint" | "workshop" | "unknown" {
  const t = rawType.toLowerCase();
  if (t.includes("conference")) return "conference";
  if (t.includes("journal")) return "journal";
  if (t.includes("workshop")) return "workshop";
  if (/cvpr|iccv|eccv|nips|neurips|icml|iclr|ijcai|aaai|icra|iros/i.test(name)) return "conference";
  if (/tpami|tip|ral|tro|ijcv/i.test(name)) return "journal";
  return "unknown";
}
