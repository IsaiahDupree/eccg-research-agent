#!/usr/bin/env node
/**
 * End-to-end demo of the collaborative round-trip.
 *
 *  1. Hand-pick 6 representative papers from the live corpus.
 *  2. Save each to the team library via /api/library.
 *  3. Cast varied ±1 votes from 3 personas (rick, alexis, isaiah).
 *  4. Post one team note per paper from the most relevant persona.
 *  5. Pull library + votes + notes from the deployed API and assemble the
 *     same Markdown that the /library "Export Markdown" button generates.
 *  6. Write the file to docs/DEMO_LIBRARY_EXPORT.md so it's in the repo.
 */

import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "https://eccg-research-agent.vercel.app";

const PERSONAS = ["isaiah", "rick", "alexis"];

// Six papers covering survey / SLAM / object-detection / dataset / hardware / simulator
// All confirmed to live in the current corpus.
const PICKS = [
  {
    id: "arxiv-2402.18221",
    saver: "rick",
    votes: [
      { voter: "rick", value: 1, reason: "the canonical TPAMI 2026 update — must-read" },
      { voter: "alexis", value: 1, reason: "best single reference for newcomers" },
      { voter: "isaiah", value: 1, reason: "ground-truth taxonomy source for our pipeline" },
    ],
    note: {
      author: "rick",
      body:
        "Replace the static spreadsheet with this. It already organises 1,200 papers across the 14 open problems we're tracking — our weekly review can start here every week.",
    },
  },
  {
    id: "arxiv-2404.10112",
    saver: "isaiah",
    votes: [
      { voter: "isaiah", value: 1, reason: "Gaussian splat from events is the big unlock" },
      { voter: "rick", value: 1, reason: "answers the SLAM-without-frames question we keep hitting" },
      { voter: "alexis", value: 0, reason: "" },
    ],
    note: {
      author: "isaiah",
      body:
        "Online tracking at event rate is the unlock. We should benchmark it against ORB-SLAM3 on the DSEC-Flow night splits — see if the 6 % RMSE claim holds where every other method drops 32 %.",
    },
  },
  {
    id: "arxiv-2403.11421",
    saver: "rick",
    votes: [
      { voter: "rick", value: 1, reason: "closed-loop drone at 8× lower power" },
      { voter: "isaiah", value: 1, reason: "Loihi 2 deployment recipe is publishable on its own" },
    ],
    note: {
      author: "rick",
      body:
        "Reach out to Antonio about the chip configs they're sharing. This is the proof-point that the spiking-on-neuromorphic loop closes end-to-end at real-time.",
    },
  },
  {
    id: "arxiv-2402.01133",
    saver: "alexis",
    votes: [
      { voter: "alexis", value: 1, reason: "4× MVSEC + lighting splits is what the field needs" },
      { voter: "rick", value: 1, reason: "the data foundation for our weekly benchmark proposal" },
    ],
    note: {
      author: "alexis",
      body:
        "Low-light split is where every method drops 32 %. If we anchor a shared leaderboard on DSEC-Flow's lighting filters, we'll see who's actually robust vs. who's overfit to daylight.",
    },
  },
  {
    id: "arxiv-2401.05572",
    saver: "isaiah",
    votes: [
      { voter: "isaiah", value: 1, reason: "Nature Electronics on a 6.5 MP spike camera changes the optics" },
      { voter: "rick", value: 0, reason: "" },
    ],
    note: {
      author: "isaiah",
      body:
        "140 dB dynamic range + 100 kfps means we're past the prototype phase for spike cameras. Worth a deeper dive on whether the pixel architecture is open enough to drop into v2e-Lite.",
    },
  },
  {
    id: "arxiv-2405.02244",
    saver: "rick",
    votes: [
      { voter: "rick", value: 1, reason: "540 fps on a Jetson is what the small labs actually need" },
      { voter: "alexis", value: 1, reason: "edge-deployable simulator finally unlocks classroom use" },
    ],
    note: {
      author: "alexis",
      body:
        "Make this the default simulator in any tutorial we put together. The Jetson Orin Nano price point is what makes event-camera curricula accessible at our scale.",
    },
  },
];

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function getJson(url) {
  const res = await fetch(url);
  return await res.json();
}

// --read-only skips mutations (after the first successful run, the Drive
// state is already populated; re-runs would dup notes).
const READ_ONLY = process.argv.includes("--read-only");

console.log(`Demo flow against ${BASE}${READ_ONLY ? " (read-only)" : ""}`);
console.log(`Personas: ${PERSONAS.join(", ")}\n`);

if (!READ_ONLY) {
  console.log("▌ 1. Adding to team library");
  for (const p of PICKS) {
    const r = await postJson(`${BASE}/api/library`, {
      action: "add",
      paper_id: p.id,
      user: p.saver,
    });
    console.log(`  + ${p.id.padEnd(20)} by ${p.saver.padEnd(8)} → ${r.status}`);
  }

  console.log("\n▌ 2. Casting votes");
  for (const p of PICKS) {
    for (const v of p.votes) {
      if (v.value === 0) continue;
      const r = await postJson(`${BASE}/api/votes/${encodeURIComponent(p.id)}`, v);
      console.log(
        `  ${v.value > 0 ? "↑" : "↓"} ${p.id.padEnd(20)} by ${v.voter.padEnd(8)} (${r.status})`,
      );
    }
  }

  console.log("\n▌ 3. Posting notes");
  for (const p of PICKS) {
    const r = await postJson(`${BASE}/api/notes/${encodeURIComponent(p.id)}`, p.note);
    console.log(`  note on ${p.id.padEnd(20)} by ${p.note.author.padEnd(8)} → ${r.status}`);
  }
} else {
  console.log("▌ 1-3. Mutations SKIPPED (--read-only)");
}

// Step 4 — fetch back everything we just wrote
console.log("\n▌ 4. Fetching back");
const lib = await getJson(`${BASE}/api/library`);
const votes = await getJson(`${BASE}/api/votes`);
const orderedLib = lib.library
  .filter((l) => PICKS.some((p) => p.id === l.paper_id))
  .sort((a, b) => b.added_at.localeCompare(a.added_at));
console.log(`  library: ${lib.library.length} items, ${orderedLib.length} from this demo`);
console.log(`  votes:   ${votes.total_papers} papers with votes`);

const noteFetches = await Promise.all(
  PICKS.map(async (p) => {
    const j = await getJson(`${BASE}/api/notes/${encodeURIComponent(p.id)}`);
    return [p.id, j.notes ?? []];
  }),
);
const notesById = Object.fromEntries(noteFetches);

// Step 5 — fetch canonical scores from /api/papers (which runs the seed
// pipeline server-side and emits the same totals shown on /) and merge
// with full metadata from the repo JSONs (abstract isn't in the API
// payload).
console.log("\n▌ 5. Loading corpus");
const apiPapers = await getJson(`${BASE}/api/papers`);
const scoreById = new Map();
for (const p of apiPapers.papers ?? []) scoreById.set(p.id, p.score);

const corpus = JSON.parse(readFileSync("src/fixtures/eccg_corpus.json", "utf-8"));
const seed = JSON.parse(readFileSync("src/fixtures/seed_papers.json", "utf-8"));
const byId = new Map();
for (const s of corpus) {
  byId.set(s.paper.id, { paper: s.paper, total: scoreById.get(s.paper.id) ?? s.total });
}
for (const p of seed) {
  if (!byId.has(p.id)) byId.set(p.id, { paper: p, total: scoreById.get(p.id) ?? 0 });
}
console.log(
  `  resolved ${PICKS.filter((p) => byId.has(p.id)).length}/${PICKS.length} papers; live scoring from ${apiPapers.count} API entries`,
);

// Step 6 — build markdown matching the /library "Export Markdown" output
console.log("\n▌ 6. Building Markdown");
function formatMonthsAgo(months) {
  if (months < 1) return "this month";
  if (months < 12) return `${Math.round(months)} mo ago`;
  return `${(months / 12).toFixed(1)}y ago`;
}
function categoryLabel(slug) {
  if (!slug) return "Unclassified";
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const lines = [];
const date = new Date().toISOString().slice(0, 10);
lines.push(`# ECCG Library — ${date}`);
lines.push("");
lines.push(`*Generated from the shared Drive library. ${orderedLib.length} papers.*`);
lines.push("");
lines.push("---");
lines.push("");

for (let i = 0; i < orderedLib.length; i++) {
  const saved = orderedLib[i];
  const s = byId.get(saved.paper_id);
  if (!s) continue;
  const p = s.paper;
  const tally = votes.votes[saved.paper_id];
  const myNotes = notesById[saved.paper_id] ?? [];

  lines.push(`## ${i + 1}. ${p.title}`);
  lines.push("");
  lines.push(`**Authors:** ${p.authors.map((a) => a.name).join(", ")}`);
  lines.push(
    `**Venue:** ${p.venue?.name ?? "arXiv preprint"} · ${formatMonthsAgo(p.months_since_publish)}`,
  );
  if (p.eccg_category) lines.push(`**Category:** ${categoryLabel(p.eccg_category)}`);
  lines.push(`**Rubric score:** ${s.total.toFixed(0)} / 100`);
  if (tally && (tally.up || tally.down)) {
    lines.push(
      `**Community vote:** ↑${tally.up} / ↓${tally.down} (net ${tally.net >= 0 ? "+" : ""}${tally.net})`,
    );
  }
  if (p.html_url) lines.push(`**Link:** [${p.html_url}](${p.html_url})`);
  lines.push(`**Saved by:** ${saved.added_by} on ${new Date(saved.added_at).toLocaleDateString()}`);
  lines.push("");
  if (p.abstract) {
    lines.push("**Abstract.**");
    lines.push("");
    lines.push(p.abstract);
    lines.push("");
  }
  if (myNotes.length > 0) {
    lines.push("**Team notes:**");
    lines.push("");
    for (const n of myNotes) {
      lines.push(
        `- _${n.author}, ${new Date(n.created_at).toLocaleString()}:_ ${n.body.replace(/\n+/g, " ")}`,
      );
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
}

const md = lines.join("\n");
writeFileSync("docs/DEMO_LIBRARY_EXPORT.md", md);
console.log(`  → wrote docs/DEMO_LIBRARY_EXPORT.md (${md.length.toLocaleString()} chars)`);
console.log("");
console.log("Done.");
