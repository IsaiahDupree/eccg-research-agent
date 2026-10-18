#!/usr/bin/env tsx
/**
 * Seed-corpus runner — prints the markdown digest of the fixture papers.
 * Useful to verify the rendering / rubric without burning any API calls.
 */

import { loadSeedPipeline } from "../src/lib/seed";

const result = loadSeedPipeline();
console.log(`Seed corpus: ${result.scored.length} papers\n`);
for (const [i, s] of result.scored.entries()) {
  console.log(
    `${(i + 1).toString().padStart(2)}. [${s.total.toFixed(0).padStart(2)}] ${s.paper.title}`,
  );
  for (const c of s.categories) {
    console.log(`     ${c.name.padEnd(20)} ${c.raw.toFixed(1).padStart(4)}/10 · w${c.weight}`);
  }
}
