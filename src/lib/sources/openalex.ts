/**
 * OpenAlex source — third citation/metadata source after Semantic Scholar
 * and Crossref. Used as a fallback for gap-fill when S2 returns nothing
 * for a DOI, and to enrich papers with openalex_id + open-access status.
 *
 * https://api.openalex.org/works — free, no key, polite rate limits
 * encourage `mailto=` in the request (we send our contact email).
 */

import { withCache } from "../cache";
import { fetchWithRetry } from "../fetch_retry";
import type { Paper } from "../models";

const OA_API = "https://api.openalex.org";
const CONTACT = "isaiahdupree33@gmail.com";

interface OpenAlexWork {
  id: string; // canonical OA URL, e.g. "https://openalex.org/W2741809807"
  doi?: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  is_oa?: boolean;
  open_access?: { is_oa?: boolean; oa_url?: string };
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: {
    source?: { display_name?: string; type?: string };
    landing_page_url?: string;
    pdf_url?: string;
  };
  ids?: { doi?: string; openalex?: string; mag?: string };
}

export interface OpenAlexHit {
  openalex_id: string;
  doi?: string;
  title?: string;
  cited_by_count?: number;
  is_oa?: boolean;
  oa_url?: string;
  venue_name?: string;
}

function extractId(work: OpenAlexWork): string {
  // OA ids look like "https://openalex.org/W123..." — strip prefix.
  return (work.id ?? "").replace("https://openalex.org/", "");
}

function shape(work: OpenAlexWork): OpenAlexHit {
  return {
    openalex_id: extractId(work),
    doi: work.doi ?? work.ids?.doi,
    title: work.title,
    cited_by_count: work.cited_by_count,
    is_oa: work.is_oa ?? work.open_access?.is_oa,
    oa_url: work.open_access?.oa_url ?? work.primary_location?.pdf_url,
    venue_name: work.primary_location?.source?.display_name,
  };
}

async function fetchOA(path: string): Promise<unknown> {
  const url = `${OA_API}${path}${path.includes("?") ? "&" : "?"}mailto=${encodeURIComponent(CONTACT)}`;
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "eccg-research-agent/0.1",
      },
    },
    {
      maxAttempts: 3,
      baseMs: 800,
      onRetry: (n, reason, wait) =>
        console.warn(`[openalex] retry ${n} after ${reason} — waiting ${wait}ms`),
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenAlex ${res.status}: ${res.statusText}`);
  return res.json();
}

/** Resolve a single work by DOI. Returns null on miss. */
export async function fetchByDoi(doi: string): Promise<OpenAlexHit | null> {
  const clean = doi.replace(/^https?:\/\/doi\.org\//, "").trim();
  if (!clean) return null;
  return withCache("openalex", { doi: clean }, async () => {
    const data = (await fetchOA(`/works/doi:${encodeURIComponent(clean)}`)) as OpenAlexWork | null;
    return data ? shape(data) : null;
  });
}

/** Resolve a single work by arXiv id. Uses OA's `arxiv:` lookup. */
export async function fetchByArxivId(arxivId: string): Promise<OpenAlexHit | null> {
  const clean = arxivId.replace(/^arxiv[-:]/i, "").replace(/v\d+$/i, "").trim();
  if (!clean) return null;
  return withCache("openalex", { arxiv: clean }, async () => {
    const data = (await fetchOA(
      `/works?filter=ids.openalex:arxiv:${encodeURIComponent(clean)}&per-page=1`,
    )) as { results?: OpenAlexWork[] } | null;
    const first = data?.results?.[0];
    return first ? shape(first) : null;
  });
}

/**
 * Hydrate an array of Papers in place: when openalex_id is missing,
 * look up by doi or arxiv_id. Failures are swallowed (mirrors S2 behaviour).
 * Concurrency limited to 4 — OA's polite limit is 10 req/s for mailto-tagged
 * callers; 4 lets us share with S2 in the same cron run.
 */
export async function hydrateWithOpenAlex(papers: Paper[]): Promise<void> {
  const concurrency = 4;
  let i = 0;
  async function worker() {
    while (i < papers.length) {
      const me = i++;
      const p = papers[me];
      if (p.openalex_id) continue;
      try {
        const hit = p.doi
          ? await fetchByDoi(p.doi)
          : p.arxiv_id
            ? await fetchByArxivId(p.arxiv_id)
            : null;
        if (hit) {
          p.openalex_id = hit.openalex_id;
          if (hit.cited_by_count !== undefined && !p.citation_count) {
            p.citation_count = hit.cited_by_count;
          }
          if (!p.doi && hit.doi) p.doi = hit.doi;
        }
      } catch (err) {
        console.warn(`[openalex] skip ${p.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
