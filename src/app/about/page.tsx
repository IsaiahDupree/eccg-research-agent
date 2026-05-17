import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "About",
  description:
    "How the ECCG Research Agent aggregates, scores, and ranks event-camera and neuromorphic-compute research. Sources, rubric weights, and methodology.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About — ECCG Research Agent",
    description:
      "Methodology behind the event-camera research aggregator: sources, rubric, scoring, replication-strength weighting.",
  },
};

interface FaqEntry {
  question: string;
  answer: string;
}

// FAQ entries are also surfaced as Schema.org FAQPage JSON-LD so SERPs
// can build a FAQ-rich result. Keep answers under ~280 chars — Google
// truncates longer responses in the SERP card.
const FAQ: FaqEntry[] = [
  {
    question: "What is the ECCG Research Agent?",
    answer:
      "A continuously-updated digest of event-based-vision and neuromorphic-compute research. 1,300+ papers pulled from arXiv and Semantic Scholar, ranked on a transparent 9-axis rubric, citation-graph weighted, and discussed in recurring community meetings.",
  },
  {
    question: "How is this different from arXiv or Google Scholar?",
    answer:
      "arXiv lists papers; Scholar tracks citations. Neither tells you which event-camera papers other event-camera researchers actually built on. ECCG focuses on a single community, weights citations by intent (methodology / result / extension count more than background), and lets the team vote.",
  },
  {
    question: "How are papers scored?",
    answer:
      "Each paper gets a 0-100 score across nine axes: ECCG relevance, citation velocity (vs venue baseline), in-corpus citation graph, community votes, code availability, semantic novelty, venue prestige, author signal, and recency. Weights are team-configurable at /settings.",
  },
  {
    question: "Where does the corpus come from?",
    answer:
      "Daily arXiv polling across cs.CV / cs.RO / cs.NE filtered by event-camera keywords, hydrated with Semantic Scholar citation data, plus team uploads via /upload and gap-fill ingests from /gaps. The full corpus is exportable as JSON, CSV, or BibTeX.",
  },
  {
    question: "What is replication-strength citation weighting?",
    answer:
      "Semantic Scholar tags each citation as background / methodology / result / extensionMethodology. The leaderboard's Influence mode counts methodology / result / extension 2× a regular citation — they indicate the citing paper actually built on this work, not just named it.",
  },
  {
    question: "Can I cite a paper from this site?",
    answer:
      "Cite the paper itself — use the BibTeX export from /library or the arXiv id on each paper page. This site is a discovery + ranking tool, not a source of record. The /api/library/export endpoint supports bibtex, csv, json, and an annotated-bib (BibTeX + team notes) format.",
  },
  {
    question: "How do I add a paper that's missing?",
    answer:
      "Editors can ingest by arXiv id directly from /gaps (foundational papers the corpus cites but doesn't index), or upload a spreadsheet via /upload. Cron-discovered papers land in /review for the team to approve, reject, or batch-process by category.",
  },
  {
    question: "What's the rate of new papers?",
    answer:
      "The daily cron at 06:00 UTC typically discovers 5-50 new event-camera papers across all three niches (event_camera, neuromorphic_compute, spike_camera). New additions appear on /whats-new and trigger a Telegram + Slack digest.",
  },
];

const SITE_URL =
  process.env.SITE_URL?.trim() || "https://eccg-research-agent.vercel.app";

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />
      <Breadcrumbs trail={[{ label: "Home", href: "/" }, { label: "About" }]} />
      <article className="prose prose-zinc max-w-3xl dark:prose-invert">
        <h1>About the ECCG Research Agent</h1>
        <p>
          A research aggregator built so event-camera researchers can spend
          their time on research, not on the meta-work of finding what to read.
          Tracks event-based vision, neuromorphic computing, and spike-camera
          work across <Link href="/">arXiv</Link>,{" "}
          <Link href="/">Semantic Scholar</Link>, and GitHub — ranked on a
          transparent rubric and discussed in recurring community meetings.
        </p>

        <h2>Frequently asked</h2>
        <dl>
          {FAQ.map((f) => (
            <div key={f.question} className="mt-4">
              <dt className="text-base font-semibold">{f.question}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {f.answer}
              </dd>
            </div>
          ))}
        </dl>

        <h2>What it does</h2>
        <ul>
          <li>
            Pulls new papers from arXiv (cs.CV / cs.RO / cs.NE) filtered for
            event-camera keywords.
          </li>
          <li>
            Hydrates each paper with citation counts, venue, and citation-intent
            data from Semantic Scholar.
          </li>
          <li>
            Searches GitHub for an associated code repo, scored by recency +
            popularity.
          </li>
          <li>
            Computes citation velocity, semantic-embedding novelty, and
            ECCG-taxonomy relevance.
          </li>
          <li>
            Ranks the corpus on a 9-axis rubric with team-configurable weights.
          </li>
          <li>
            Generates an LLM digest per top-N paper (Anthropic primary, OpenAI
            fallback), cached to Drive so the same paper isn&apos;t re-billed.
          </li>
        </ul>

        <h2>How it ranks</h2>
        <p>The rubric is data, not code. Weights total 100:</p>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Weight</th>
              <th>Why it matters</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ECCG relevance</td>
              <td>25</td>
              <td>Strong taxonomy match dominates over generic ML</td>
            </tr>
            <tr>
              <td>Citation velocity</td>
              <td>20</td>
              <td>Acceleration beats raw count</td>
            </tr>
            <tr>
              <td>Citation graph</td>
              <td>10</td>
              <td>Replication-strength intent on inbound cites</td>
            </tr>
            <tr>
              <td>Community votes</td>
              <td>10</td>
              <td>Team taste, editor-weighted</td>
            </tr>
            <tr>
              <td>Code availability</td>
              <td>10</td>
              <td>Replicable work compounds in the community</td>
            </tr>
            <tr>
              <td>Novelty</td>
              <td>10</td>
              <td>Embedding distance from corpus centroid</td>
            </tr>
            <tr>
              <td>Venue prestige</td>
              <td>5</td>
              <td>Tier-1 venue is a signal, not a verdict</td>
            </tr>
            <tr>
              <td>Author h-index</td>
              <td>5</td>
              <td>Track-record proxy</td>
            </tr>
            <tr>
              <td>Recency</td>
              <td>5</td>
              <td>Mild bias toward fresh work</td>
            </tr>
          </tbody>
        </table>

        <h2>Sources</h2>
        <ul>
          <li>
            <strong>arXiv</strong> — Atom API, no key. Daily polling of
            cs.CV / cs.RO / cs.NE.
          </li>
          <li>
            <strong>Semantic Scholar</strong> — citation graph + intent labels +
            h-index proxy.
          </li>
          <li>
            <strong>OpenAlex</strong> — fallback for DOIs not in S2, plus
            open-access detection.
          </li>
          <li>
            <strong>GitHub</strong> — paper-to-code matching.
          </li>
          <li>
            <strong>UZH-RPG taxonomy</strong> — the canonical{" "}
            <a href="https://github.com/uzh-rpg/event-based_vision_resources">
              event-based vision resources
            </a>{" "}
            list, distilled into 17 keyword-anchored categories.
          </li>
          <li>
            <strong>Google Drive (ECCG)</strong> — meeting recordings,
            transcripts, and team state (votes, library, notes, audit log).
          </li>
        </ul>

        <h2>Machine-readable endpoints</h2>
        <ul>
          <li>
            <a href="/sitemap.xml">/sitemap.xml</a> — full URL index for search
            engines.
          </li>
          <li>
            <a href="/llms.txt">/llms.txt</a> — top-level guide for AI crawlers.
          </li>
          <li>
            <a href="/feed.xml">/feed.xml</a> — RSS of recent additions.
          </li>
          <li>
            <a href="/api/library/export?format=bibtex">/api/library/export</a>{" "}
            — BibTeX / CSV / JSON / annotated-BibTeX.
          </li>
          <li>
            <a href="/api/health">/api/health</a> — service status.
          </li>
        </ul>
      </article>
    </>
  );
}
