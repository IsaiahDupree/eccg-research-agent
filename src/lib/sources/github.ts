/**
 * GitHub source — searches for code repos associated with papers.
 *
 * Strategy: search the GH search API with the paper title + "event camera".
 * The first 3 high-star matches are returned as RepoSignal[]. This is a
 * heuristic; V1.1 can match by arXiv ID inside README.
 */

import { withCache } from "../cache";
import type { Paper, RepoSignal } from "../models";

const GH_SEARCH = "https://api.github.com/search/repositories";

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "eccg-research-agent/0.1",
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

interface GhRepo {
  html_url: string;
  full_name: string;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  language?: string;
}

export async function searchReposForPaper(paper: Paper): Promise<RepoSignal[]> {
  // Use the first ~12 words of the title to keep queries focused
  const titleSnip = paper.title.split(/\s+/).slice(0, 12).join(" ");
  const q = `${titleSnip} event camera`;
  const url = `${GH_SEARCH}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=5`;
  return withCache("github", { url }, async () => {
    const res = await fetch(url, { headers: headers() });
    if (res.status === 403 || res.status === 422) return [];
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: GhRepo[] };
    return (json.items ?? []).slice(0, 3).map((r) => ({
      url: r.html_url,
      full_name: r.full_name,
      stars: r.stargazers_count,
      forks: r.forks_count,
      last_pushed_at: r.pushed_at,
      language: r.language,
      hours_since_push: (Date.now() - new Date(r.pushed_at).getTime()) / 3_600_000,
      paper_id: paper.id,
    }));
  });
}

export async function findReposForPapers(papers: Paper[]): Promise<Map<string, RepoSignal>> {
  const out = new Map<string, RepoSignal>();
  // Only try for the top ~15 papers to stay under rate limits
  const subset = papers.slice(0, 15);
  const concurrency = 3;
  let i = 0;
  async function worker(): Promise<void> {
    while (i < subset.length) {
      const idx = i++;
      const p = subset[idx];
      try {
        const repos = await searchReposForPaper(p);
        if (repos.length) out.set(p.id, repos[0]);
      } catch {
        // skip
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}
