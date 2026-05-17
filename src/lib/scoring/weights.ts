/**
 * Scoring rubric. Pure data — change a weight, change the ranking.
 *
 * Weights sum to 100 so the composite is naturally on a 0–100 scale.
 * Each category's contribution is `raw (0-10) * weight / 10`, so max
 * contribution equals the weight value.
 */

export interface RubricCategory {
  name: string;
  weight: number;
  description: string;
}

export interface Rubric {
  categories: RubricCategory[];
}

export const DEFAULT_RUBRIC: Rubric = {
  categories: [
    {
      name: "citation_velocity",
      weight: 13,
      description: "Citations per month since publish, normalised by venue baseline.",
    },
    {
      name: "eccg_relevance",
      weight: 22,
      description: "How strongly the abstract aligns with the UZH-RPG taxonomy + core keywords.",
    },
    {
      name: "code_availability",
      weight: 12,
      description: "Public code repo exists + has had a push in the last 6 months.",
    },
    {
      name: "novelty",
      weight: 12,
      description: "TF-IDF distance from the corpus centroid (V1) / embedding distance (V1.1).",
    },
    {
      name: "venue_prestige",
      weight: 8,
      description: "Tier-1 venue (CVPR/ICCV/ECCV/NeurIPS/ICRA/IROS/TPAMI) > others.",
    },
    {
      name: "author_signal",
      weight: 6,
      description: "Max author h-index, normalised.",
    },
    {
      name: "recency",
      weight: 5,
      description: "Exponential decay over 12 months — fresher work weighted slightly higher.",
    },
    {
      name: "community_score",
      weight: 12,
      description:
        "ECCG team votes (Reddit-style ±1). Live overlay computed client-side from the Drive-backed votes state; here it's a placeholder filled in at render time on /paper/[id].",
    },
    {
      name: "citation_graph",
      weight: 10,
      description:
        "In-corpus citation count, weighted toward replication-strength citations (papers that built on this work — methodology/result intent — not just named it as background).",
    },
  ],
};

// Venue tiers used by venue_prestige
const TIER1 = /\b(CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|TPAMI|IJCV|TRO|RAL|ICRA|IROS)\b/i;
const TIER2 = /\b(BMVC|WACV|3DV|AAAI|IJCAI|TIP|TCSVT|ACCV|TVCG)\b/i;

export function venuePrestige(venueName?: string): number {
  if (!venueName) return 3;
  if (TIER1.test(venueName)) return 9;
  if (TIER2.test(venueName)) return 7;
  return 4;
}
