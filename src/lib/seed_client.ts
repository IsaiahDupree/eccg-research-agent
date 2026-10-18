/**
 * Client-only seed loader. Reuses the seed JSON without depending on Node
 * APIs so it can be imported from "use client" components.
 */

import seedJson from "../fixtures/seed_papers.json" with { type: "json" };
import { computeVelocitySignals, deriveCitationsPerMonth } from "./analysis/citation_velocity";
import { computeNoveltySignals } from "./analysis/novelty";
import { assignRelevance } from "./analysis/relevance";
import type { Paper, PipelineResult } from "./models";
import { Scorer } from "./scoring/rubric";

export function loadSeedPipelineClient(): PipelineResult {
  const papers = (seedJson as Paper[]).map((p) => ({ ...p }));
  deriveCitationsPerMonth(papers);
  assignRelevance(papers);
  const velocities = computeVelocitySignals(papers);
  const novelties = computeNoveltySignals(papers);
  const velIndex = Object.fromEntries(velocities.map((v) => [v.paper_id, v]));
  const novIndex = Object.fromEntries(novelties.map((n) => [n.paper_id, n]));
  const scorer = new Scorer();
  const scored = papers
    .map((p) => scorer.score({ paper: p, velocity: velIndex[p.id], novelty: novIndex[p.id] }))
    .sort((a, b) => b.total - a.total);
  return {
    niche: "event_camera",
    raw: { papers, repos: [], venues: {}, velocities, novelties },
    scored,
    digests: [],
  };
}
