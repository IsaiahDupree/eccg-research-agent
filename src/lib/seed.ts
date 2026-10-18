/**
 * Seed data loader.
 *
 * Merges the small hand-crafted fixture (`seed_papers.json`) with the
 * 1,072-paper ingested corpus from Rick's spreadsheet (`eccg_corpus.json`).
 * The hand-crafted fixtures stay because they carry pre-set categories and
 * realistic citation counts that the arXiv-only ingest doesn't have yet.
 */

import seedJson from "../fixtures/seed_papers.json" with { type: "json" };
import eccgCorpus from "../fixtures/eccg_corpus.json" with { type: "json" };
import { computeVelocitySignals, deriveCitationsPerMonth } from "./analysis/citation_velocity";
import { computeNoveltySignals } from "./analysis/novelty";
import { assignRelevance } from "./analysis/relevance";
import { fixtureDigest } from "./llm/provider";
import type { Paper, PipelineResult, ScoredPaper } from "./models";
import { Scorer } from "./scoring/rubric";

interface IngestedScored {
  paper: Paper;
  total: number;
  categories: ScoredPaper["categories"];
}

export function loadSeedPipeline(): PipelineResult {
  // Hand-crafted seed papers (10) — full LLM-quality fixtures
  const handCrafted = (seedJson as Paper[]).map((p) => ({ ...p }));

  // Ingested corpus already has scoring + analysis baked in from the offline run
  const ingested = (eccgCorpus as IngestedScored[]).filter(
    (s) => !handCrafted.some((p) => p.id === s.paper.id), // dedupe by id
  );

  // Recompute analysis on the hand-crafted set so it matches the engine version
  deriveCitationsPerMonth(handCrafted);
  assignRelevance(handCrafted);
  const velocities = computeVelocitySignals(handCrafted);
  const novelties = computeNoveltySignals(handCrafted);
  const velIndex = Object.fromEntries(velocities.map((v) => [v.paper_id, v]));
  const novIndex = Object.fromEntries(novelties.map((n) => [n.paper_id, n]));

  const scorer = new Scorer();
  const handScored = handCrafted.map((p) =>
    scorer.score({ paper: p, velocity: velIndex[p.id], novelty: novIndex[p.id] }),
  );

  const allScored: ScoredPaper[] = [
    ...handScored,
    ...ingested.map((s) => ({ ...s, repo: undefined } as ScoredPaper)),
  ].sort((a, b) => b.total - a.total);

  const allPapers = allScored.map((s) => s.paper);
  const digests = handScored
    .slice(0, 10)
    .sort((a, b) => b.total - a.total)
    .map(fixtureDigest);

  return {
    niche: "event_camera",
    raw: {
      papers: allPapers,
      repos: [],
      venues: Object.fromEntries(
        allPapers.filter((p) => p.venue).map((p) => [p.venue!.name, p.venue!]),
      ),
      velocities,
      novelties,
    },
    scored: allScored,
    digests,
  };
}
