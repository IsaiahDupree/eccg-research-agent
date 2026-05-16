/**
 * Apply the rubric: turn a Paper + signals into a ScoredPaper.
 *
 * Each category produces a raw score (0–10) and a one-line rationale.
 * Weighted contribution = raw * weight / 10. Total = sum of contributions,
 * naturally in 0–100.
 */

import type {
  CategoryScore, CitationVelocitySignal, NoveltySignal, Paper,
  RepoSignal, ScoredPaper,
} from "../models";
import { DEFAULT_RUBRIC, type Rubric, venuePrestige } from "./weights";

export interface ScorerInputs {
  paper: Paper;
  velocity?: CitationVelocitySignal;
  novelty?: NoveltySignal;
  repo?: RepoSignal;
}

export class Scorer {
  constructor(public rubric: Rubric = DEFAULT_RUBRIC) {}

  score(inputs: ScorerInputs): ScoredPaper {
    const { paper, velocity, novelty, repo } = inputs;
    const cats: CategoryScore[] = [];

    for (const cat of this.rubric.categories) {
      switch (cat.name) {
        case "citation_velocity":
          cats.push(this.scoreVelocity(cat.weight, velocity));
          break;
        case "eccg_relevance":
          cats.push(this.scoreRelevance(cat.weight, paper));
          break;
        case "code_availability":
          cats.push(this.scoreCode(cat.weight, repo));
          break;
        case "novelty":
          cats.push(this.scoreNovelty(cat.weight, novelty));
          break;
        case "venue_prestige":
          cats.push(this.scorePrestige(cat.weight, paper));
          break;
        case "author_signal":
          cats.push(this.scoreAuthors(cat.weight, paper));
          break;
        case "recency":
          cats.push(this.scoreRecency(cat.weight, paper));
          break;
        case "community_score":
          // Placeholder — actual community boost is applied at render time
          // by overlaying the Drive-backed votes state on top of the base
          // score (see lib/votes_client.ts + components/PaperList.tsx).
          cats.push({
            name: "community_score",
            weight: cat.weight,
            raw: 5,
            rationale: "neutral until votes are cast",
          });
          break;
      }
    }

    const total = cats.reduce((s, c) => s + (c.raw * c.weight) / 10, 0);
    return { paper, total, categories: cats, repo };
  }

  private scoreVelocity(weight: number, v?: CitationVelocitySignal): CategoryScore {
    if (!v) {
      return { name: "citation_velocity", weight, raw: 0, rationale: "no citation data" };
    }
    // multiplier of 1 = baseline → 5/10. log-shaped above.
    const raw = v.multiplier <= 0 ? 0 : Math.min(10, 5 + 2 * Math.log2(v.multiplier + 1));
    return {
      name: "citation_velocity",
      weight,
      raw,
      rationale: `${v.citations_per_month.toFixed(2)} cit/mo, ${v.multiplier.toFixed(1)}× venue baseline`,
    };
  }

  private scoreRelevance(weight: number, p: Paper): CategoryScore {
    const r = p.eccg_relevance ?? 0;
    return {
      name: "eccg_relevance",
      weight,
      raw: r * 10,
      rationale: p.eccg_category
        ? `taxonomy: ${p.eccg_category} (${r.toFixed(2)})`
        : `core-keyword match ${r.toFixed(2)}`,
    };
  }

  private scoreCode(weight: number, repo?: RepoSignal): CategoryScore {
    if (!repo) {
      return { name: "code_availability", weight, raw: 0, rationale: "no public repo found" };
    }
    const months = repo.hours_since_push / (24 * 30.44);
    const freshness = Math.exp(-months / 6); // 6-mo half-life-ish
    const popularity = Math.min(1, Math.log10(repo.stars + 1) / 3);
    const raw = Math.min(10, 4 + freshness * 4 + popularity * 4);
    return {
      name: "code_availability",
      weight,
      raw,
      rationale: `${repo.full_name} ⭐ ${repo.stars}, last push ${months.toFixed(1)} mo ago`,
    };
  }

  private scoreNovelty(weight: number, n?: NoveltySignal): CategoryScore {
    const raw = (n?.novelty ?? 0.5) * 10;
    return {
      name: "novelty",
      weight,
      raw,
      rationale: `corpus-distance ${(n?.novelty ?? 0.5).toFixed(2)}`,
    };
  }

  private scorePrestige(weight: number, p: Paper): CategoryScore {
    const raw = venuePrestige(p.venue?.name);
    return {
      name: "venue_prestige",
      weight,
      raw,
      rationale: `venue: ${p.venue?.name ?? "unknown"}`,
    };
  }

  private scoreAuthors(weight: number, p: Paper): CategoryScore {
    const maxH = p.authors.reduce((m, a) => Math.max(m, a.h_index ?? 0), 0);
    // h=30 → raw 7, h=60 → raw 9, h=100 → raw 10
    const raw = Math.min(10, Math.log2(maxH + 1) * 1.7);
    return {
      name: "author_signal",
      weight,
      raw,
      rationale: maxH > 0 ? `max h-index: ${maxH}` : "no h-index data",
    };
  }

  private scoreRecency(weight: number, p: Paper): CategoryScore {
    // exp(-months/12) — 0 months: 10, 12 months: 3.7, 24 months: 1.4
    const raw = 10 * Math.exp(-p.months_since_publish / 12);
    return {
      name: "recency",
      weight,
      raw,
      rationale: `${p.months_since_publish.toFixed(1)} months old`,
    };
  }
}
