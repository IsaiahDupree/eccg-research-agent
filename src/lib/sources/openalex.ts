/**
 * OpenAlex source (V1.1 — stub for now).
 *
 * https://api.openalex.org/works
 * Free, no key. Returns author affiliations + open citation graph.
 * In V1 we lean on Semantic Scholar; OpenAlex slot reserved for affiliations
 * + open-access detection in V1.1.
 */

import type { Paper } from "../models";

export async function hydrateWithOpenAlex(_papers: Paper[]): Promise<void> {
  // intentionally empty in V1
}
