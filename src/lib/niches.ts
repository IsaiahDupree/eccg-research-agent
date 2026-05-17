/**
 * Niche definitions. The corpus is one big set of papers; niches are
 * keyword-based facets that re-rank and filter the same corpus to
 * surface what each sub-community cares about.
 *
 * V1 — event_camera is fully populated; the others are scaffolding so
 * the UI surface (selector, filter, niche-aware copy) is in place when
 * we want to spin up a sibling community.
 */

export interface NicheConfig {
  slug: string;
  label: string;
  description: string;
  /** core terms — a paper must hit at least one to qualify as in-niche. */
  core_keywords: string[];
  /** sample taxonomy slugs that dominate this niche (used for nav hints). */
  preferred_categories?: string[];
  /** arXiv categories the daily cron should poll for this niche. */
  arxiv_categories: string[];
}

export const NICHES: NicheConfig[] = [
  {
    slug: "event_camera",
    label: "Event Camera",
    description:
      "The founding niche. Event-based vision, DVS sensors, neuromorphic perception.",
    core_keywords: [
      "event camera",
      "event-based vision",
      "event-based",
      "dynamic vision sensor",
      "dvs",
      "davis",
      "silicon retina",
      "asynchronous vision",
    ],
    preferred_categories: [
      "slam",
      "optical_flow",
      "object_detection",
      "reconstruction",
      "depth",
    ],
    arxiv_categories: ["cs.CV", "cs.RO", "cs.NE"],
  },
  {
    slug: "neuromorphic_compute",
    label: "Neuromorphic Compute",
    description:
      "Spiking neural networks, neuromorphic chips (Loihi, TrueNorth, SpiNNaker), event-driven computation.",
    core_keywords: [
      "spiking neural network",
      "snn",
      "loihi",
      "truenorth",
      "spinnaker",
      "neuromorphic chip",
      "neuromorphic processor",
      "spiking hardware",
      "memristor",
    ],
    preferred_categories: ["snn", "neuromorphic_hardware"],
    arxiv_categories: ["cs.NE", "cs.AR"],
  },
  {
    slug: "spike_camera",
    label: "Spike Camera",
    description:
      "High-speed spike-driven imaging beyond DVS — PFM readouts, vidar-style cameras.",
    core_keywords: [
      "spike camera",
      "spike-driven",
      "vidar",
      "pulse-frequency modulation",
      "asynchronous imaging",
    ],
    preferred_categories: ["device_sensor", "reconstruction"],
    arxiv_categories: ["cs.CV", "physics.ins-det"],
  },
];

export const DEFAULT_NICHE: NicheConfig = NICHES[0];

export function findNiche(slug: string | null | undefined): NicheConfig {
  if (!slug) return DEFAULT_NICHE;
  const lower = slug.toLowerCase();
  return NICHES.find((n) => n.slug.toLowerCase() === lower) ?? DEFAULT_NICHE;
}

/**
 * Returns true when the paper's title+abstract mentions any of the niche's
 * core terms. event_camera is permissive (the corpus is built around it);
 * the niche filters only kick in once the user switches.
 */
export function matchesNiche(text: string, niche: NicheConfig): boolean {
  if (niche.slug === DEFAULT_NICHE.slug) return true;
  const lower = text.toLowerCase();
  return niche.core_keywords.some((k) => lower.includes(k));
}
