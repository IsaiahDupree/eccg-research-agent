#!/usr/bin/env tsx
/**
 * CLI runner — pull fresh papers and print a markdown digest to stdout.
 *
 * Usage:
 *   npm run refresh                          # uses env keys
 *   npm run refresh -- --no-digest           # skip LLM calls (faster, free)
 *   npm run refresh -- --fixture-digest      # use static fixture digests
 */

import "dotenv/config";
import { runPipeline } from "../src/lib/pipeline";

async function main() {
  const args = new Set(process.argv.slice(2));
  const result = await runPipeline({
    niche: process.env.ECCG_NICHE ?? "event_camera",
    topN: Number(process.env.ECCG_TOP_N ?? 10),
    generateDigests: !args.has("--no-digest"),
    useFixtureDigest: args.has("--fixture-digest"),
  });

  console.log(`# ECCG Research Digest — ${new Date().toISOString().slice(0, 10)}\n`);
  console.log(`Sampled **${result.raw.papers.length}** papers across **${
    Object.keys(result.raw.venues).length || 1
  }** venues.\n`);
  console.log("| Rank | Score | Title | Venue | Citations |");
  console.log("|---|---|---|---|---|");
  for (const [i, s] of result.scored.slice(0, 10).entries()) {
    console.log(
      `| ${i + 1} | ${s.total.toFixed(0)} | ${s.paper.title.slice(0, 70)} | ${
        s.paper.venue?.name ?? "preprint"
      } | ${s.paper.citation_count} |`,
    );
  }

  for (const d of result.digests) {
    const s = d.scored;
    console.log(`\n---\n\n## ${s.paper.title}`);
    console.log(`**Score:** ${s.total.toFixed(0)} / 100 — ${s.paper.eccg_category ?? "unclassified"}`);
    console.log(`\n**TL;DR.** ${d.tldr}`);
    console.log(`\n**Key contributions:**`);
    for (const k of d.key_contributions) console.log(`- ${k}`);
    console.log(`\n**ECCG relevance.** ${d.eccg_relevance}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
