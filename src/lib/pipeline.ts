/**
 * Pipeline orchestrator.
 *
 * `runPipeline()` is the top-level entry point. Given a niche and seed
 * categories, it pulls signals from every configured source, derives
 * analysis signals, scores papers, generates digests, and returns the
 * structured result.
 *
 * Sources that lack keys (S2, GitHub) degrade silently — pipeline still
 * works on what's available.
 */

import { computeVelocitySignals, deriveCitationsPerMonth } from "./analysis/citation_velocity";
import { computeNoveltySignals } from "./analysis/novelty";
import { assignRelevance } from "./analysis/relevance";
import { fixtureDigest, generateDigest, LlmUnavailableError } from "./llm/provider";
import type { Niche, PaperDigest, PipelineResult, ScoredPaper } from "./models";
import { Scorer } from "./scoring/rubric";
import { fetchArxivPapers } from "./sources/arxiv";
import { findReposForPapers } from "./sources/github";
import { hydrateWithOpenAlex } from "./sources/openalex";
import { hydrateWithS2 } from "./sources/semantic_scholar";

export interface PipelineOpts {
  niche?: Niche;
  topN?: number;
  generateDigests?: boolean;
  useFixtureDigest?: boolean;   // skip live LLM call (tests / no key)
  papersOverride?: PipelineResult["raw"]["papers"]; // tests bypass arXiv
}

export async function runPipeline(opts: PipelineOpts = {}): Promise<PipelineResult> {
  const {
    niche = "event_camera",
    topN = 20,
    generateDigests: shouldDigest = true,
    useFixtureDigest = false,
    papersOverride,
  } = opts;

  // 1. Source: arXiv (or override for tests / already-enriched corpus)
  const papers = papersOverride ?? (await fetchArxivPapers({ niche }));

  // 2. Hydrate with Semantic Scholar (citations, venue, h-index) — only when
  //    the caller didn't already supply enriched papers. The override path is
  //    used by tests and by the offline-ingested corpus loader.
  if (!papersOverride) {
    await hydrateWithS2(papers);
    await hydrateWithOpenAlex(papers);
  }

  // 3. Derive analysis signals
  deriveCitationsPerMonth(papers);
  assignRelevance(papers);
  const velocities = computeVelocitySignals(papers);
  const novelties = computeNoveltySignals(papers);
  const byId = (arr: { paper_id: string }[]) =>
    Object.fromEntries(arr.map((x) => [x.paper_id, x]));
  const velIndex = byId(velocities) as Record<string, (typeof velocities)[number]>;
  const novIndex = byId(novelties) as Record<string, (typeof novelties)[number]>;

  // 4. Find code (top portion only) — also skipped on override path
  const repoIndex = papersOverride
    ? new Map<string, NonNullable<ScoredPaper["repo"]>>()
    : await findReposForPapers(papers);

  // 5. Score
  const scorer = new Scorer();
  const allScored: ScoredPaper[] = papers.map((p) =>
    scorer.score({
      paper: p,
      velocity: velIndex[p.id],
      novelty: novIndex[p.id],
      repo: repoIndex.get(p.id),
    }),
  );
  allScored.sort((a, b) => b.total - a.total);
  const top = allScored.slice(0, topN);

  // 6. Digest the top-N
  let digests: PaperDigest[] = [];
  if (shouldDigest) {
    if (useFixtureDigest) {
      digests = top.map(fixtureDigest);
    } else {
      try {
        digests = [];
        for (const s of top) {
          digests.push(await generateDigest(s));
        }
      } catch (e) {
        if (e instanceof LlmUnavailableError) {
          digests = top.map(fixtureDigest);
        } else {
          throw e;
        }
      }
    }
  }

  return {
    niche,
    raw: {
      papers,
      repos: Array.from(repoIndex.values()),
      venues: Object.fromEntries(
        papers
          .filter((p) => p.venue)
          .map((p) => [p.venue!.name, p.venue!]),
      ),
      velocities,
      novelties,
    },
    scored: allScored,
    digests,
  };
}
