import Link from "next/link";

export const dynamic = "force-static";

export default function AboutPage() {
  return (
    <article className="prose prose-zinc max-w-3xl dark:prose-invert">
      <h1>About the ECCG Research Agent</h1>
      <p>
        A research aggregator built so event-camera researchers can spend their
        time on research, not on the meta-work of finding what to read.
      </p>

      <h2>What it does</h2>
      <ul>
        <li>Pulls new papers from arXiv (cs.CV / cs.RO / cs.NE) filtered for event-camera keywords.</li>
        <li>Hydrates each paper with citation counts and venue from Semantic Scholar.</li>
        <li>Searches GitHub for an associated code repo, scored by recency + popularity.</li>
        <li>Computes citation velocity, novelty, and ECCG-taxonomy relevance.</li>
        <li>Ranks the corpus on a 7-axis rubric with cited weights.</li>
        <li>Generates an LLM digest per top-N paper (Anthropic primary, OpenAI fallback).</li>
      </ul>

      <h2>How it ranks</h2>
      <p>The rubric is data, not code. Weights total 100:</p>
      <table>
        <thead>
          <tr><th>Category</th><th>Weight</th><th>Why it matters</th></tr>
        </thead>
        <tbody>
          <tr><td>ECCG relevance</td><td>25</td><td>Strong taxonomy match dominates over generic ML</td></tr>
          <tr><td>Citation velocity</td><td>20</td><td>Acceleration beats raw count</td></tr>
          <tr><td>Code availability</td><td>15</td><td>Replicable work compounds in the community</td></tr>
          <tr><td>Novelty</td><td>15</td><td>Distance from corpus centroid</td></tr>
          <tr><td>Venue prestige</td><td>10</td><td>Tier-1 venue is a signal, not a verdict</td></tr>
          <tr><td>Author h-index</td><td>10</td><td>Track-record proxy</td></tr>
          <tr><td>Recency</td><td>5</td><td>Mild bias toward fresh work</td></tr>
        </tbody>
      </table>

      <h2>Sources</h2>
      <ul>
        <li><strong>arXiv</strong> — Atom API, no key.</li>
        <li><strong>Semantic Scholar</strong> — citation graph + h-index proxy.</li>
        <li><strong>GitHub</strong> — paper-to-code matching.</li>
        <li><strong>UZH-RPG taxonomy</strong> — the canonical{" "}
          <a href="https://github.com/uzh-rpg/event-based_vision_resources">event-based vision resources</a> list, distilled into 17 keyword-anchored categories.
        </li>
        <li><strong>Google Drive (ECCG)</strong> — reserved slot for meeting recordings/notes (currently empty).</li>
      </ul>

      <h2>Influences</h2>
      <ul>
        <li><a href="https://www.researchforge.app">ResearchForge</a> — academic dashboard pattern with curated content + scores.</li>
        <li><a href="https://hylz-2019.github.io/Neuro_Vision_Map/map.html">Neuro_Vision_Map</a> — visual map of the neuromorphic-vision landscape; corpus map view is inspired by it.</li>
        <li><a href="https://www.zotero.org">Zotero</a> — the personal reference manager whose taxonomy/tagging UX is the reading-list bar to clear.</li>
        <li><a href="https://arxiv.org">arXiv</a>, <a href="https://scholar.google.com">Scholar</a> — the data substrate.</li>
        <li><Link href="/">yt-research-agent</Link> sibling repo — same layered architecture (Sources → Analysis → Scoring → LLM), retargeted to research papers.</li>
      </ul>

      <h2>Open questions in V1</h2>
      <ul>
        <li>Is the niche fixed to event-camera, or runtime-configurable? Today it&apos;s a config string.</li>
        <li>Should the public read-only view be gated until V1.1? Currently public.</li>
        <li>Where does corpus state live — checked-in JSON (today) or Vercel KV (V1.1)?</li>
      </ul>
    </article>
  );
}
