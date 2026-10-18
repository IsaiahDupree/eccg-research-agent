/**
 * Editor-weighted vote tallies.
 *
 * Each editor vote counts 2× (the base 1 already in `net`, plus an extra 1
 * counted here). Extracted from the /api/votes route handler so the math
 * can be tested independently of Next.js Request / Response plumbing.
 */

import type { CollabVotesPerPaper } from "./collab";

export interface WeightedTally {
  up: number;
  down: number;
  net: number;
  editor_up: number;
  editor_down: number;
  weighted_net: number;
}

export type EditorPredicate = (voter: string) => boolean;

/** Weight a single paper's tally given a predicate that classifies voters. */
export function weightOne(
  v: CollabVotesPerPaper,
  isEditorVoter: EditorPredicate,
): WeightedTally {
  let editor_up = 0;
  let editor_down = 0;
  for (const voter of v.voters) {
    if (!isEditorVoter(voter.voter)) continue;
    if (voter.value === 1) editor_up++;
    else if (voter.value === -1) editor_down++;
  }
  return {
    up: v.upvotes,
    down: v.downvotes,
    net: v.net,
    editor_up,
    editor_down,
    weighted_net: v.net + (editor_up - editor_down),
  };
}

/** Map every paper id to its weighted tally. */
export function weightTallies(
  votes: Record<string, CollabVotesPerPaper>,
  isEditorVoter: EditorPredicate,
): Record<string, WeightedTally> {
  const out: Record<string, WeightedTally> = {};
  for (const [id, v] of Object.entries(votes)) {
    out[id] = weightOne(v, isEditorVoter);
  }
  return out;
}
