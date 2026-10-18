# Product Requirements Document — eccg-research-agent

**Version**: 0.1 (MVP)
**Date**: 2026-05-16
**Owner**: Isaiah Dupree

---

## 1. One-line pitch

A research aggregator that lets event-camera researchers spend their time **researching** rather than **researching how to research** — pulling papers, code, and community signals into one ranked, digestible surface, modeled after [researchforge.app](https://www.researchforge.app) but specialized for the Event Camera Community Group (ECCG).

## 2. Problem

Event-camera / neuromorphic-vision research is fast-moving and scattered:

- arXiv announces ~5–15 relevant papers a week across cs.CV, cs.RO, cs.NE.
- The canonical curated list ([`uzh-rpg/event-based_vision_resources`](https://github.com/uzh-rpg/event-based_vision_resources), 3.5k stars, 17 categories, 500+ algorithm papers) is human-maintained and updates in batches.
- Citation velocity, code availability, and venue prestige live in different APIs (Semantic Scholar, OpenAlex, GitHub).
- Existing "research dashboards" are either generic (Zotero) or domain-locked (Neuro_Vision_Map's institution graph). Nothing combines *acquisition + scoring + digest* for this niche.

Researchers (the user, the ECCG community) lose hours per week to manual aggregation that a pipeline can do continuously.

## 3. Goals (V1)

1. **Continuous acquisition** — every 24h, pull new event-camera papers from arXiv (cs.CV/cs.RO/cs.NE), Semantic Scholar, and OpenAlex, plus GitHub repo updates from the canonical taxonomy.
2. **Ranked digest** — each paper gets a 0–100 composite score (citation velocity, novelty proxy, code availability, venue prestige, ECCG relevance). Top-N shown first.
3. **LLM brief per paper** — TL;DR, key contributions, how-it-relates-to-prior-work, ECCG relevance, open questions. Anthropic primary, OpenAI fallback.
4. **Three views**:
   - **List** (Zotero-like): sortable, filterable table with score, citations, code badge, venue.
   - **Map** (Neuro_Vision_Map-style force graph): nodes = papers, edges = citations; colored by sub-area; clusters labeled.
   - **Reader** (ResearchForge-style detail page): paper metadata + LLM digest + linked code + cited-by graph.
4. **Saved searches + RSS** — user defines a topic ("event-based SLAM"); system emits a weekly digest to a static RSS feed + email-ready markdown.
5. **Future Drive ingestion** — slot for ECCG meeting recordings/notes (the Drive folder is empty today; designed for when populated).
6. **Deploys on Vercel** as a public-readable, single-user-write Next.js 16 app.

## 4. Non-goals (V1)

- Paper authoring or citation management (Zotero handles that).
- Multi-tenant accounts. Single user / single org.
- PDF parsing of paper bodies (V2 — needs blob storage + parsing pipeline).
- Submitting to journals.
- Generative summaries replacing reading the paper — the digest is a **decision aid**, not a substitute.

## 5. Users

- **Primary**: Isaiah (the user) — wants daily ECCG-focused situational awareness without 90 minutes of manual scrolling.
- **Secondary**: ECCG community members — read the public digest, RSS, links.
- **Tertiary later**: other research niches (neuromorphic compute, spike cameras, neuroscience) — V1 niche is `event_camera`, but the niche slug is configurable.

## 6. Sources (Acquisition Layer)

| Source | What it gives | API tier | Key required |
|---|---|---|---|
| **arXiv** | New papers (cs.CV/cs.RO/cs.NE), title, abstract, authors, PDF URL, categories | Free | No |
| **Semantic Scholar** | Citation velocity, influential citations, recommendations, abstract | Free with key | Optional (key boosts rate limits) |
| **OpenAlex** | Open citation graph, venue prestige, author affiliations | Free | No |
| **GitHub** | Code availability + activity for paper repos, stars, forks, last commit | Free with PAT | Optional |
| **UZH-RPG taxonomy** | Canonical category list (Algorithms / Datasets / Workshops / etc.) | Static seed | No |
| **Google Drive (ECCG)** | Meeting recordings + notes (future) | OAuth | Yes (later) |

Each source implements `Source.fetch(query) -> Signal[]` and caches to disk under `.cache/<source>/<hash>.json`. Caches live 24h by default.

## 7. Analysis Layer

| Module | Function | Returns |
|---|---|---|
| `citation_velocity` | `compute_velocity(paper)` | citations per month since publish |
| `outlier_detection` | `detect_outliers(papers, venue_baseline)` | papers exceeding N× their venue's median citation count |
| `novelty_proxy` | `novelty_score(paper, corpus)` | TF-IDF distance from corpus centroid in abstract space |
| `code_availability` | `find_code_links(paper)` | matched GitHub repo + freshness score |
| `eccg_relevance` | `relevance(paper, taxonomy)` | keyword overlap with the UZH-RPG taxonomy categories |

Every analysis module is a pure function — testable with fixtures, no IO.

## 8. Scoring Rubric (0–100 composite)

| Category | Weight | Source signal |
|---|---|---|
| Citation velocity | 20 | citations/month |
| ECCG relevance | 25 | taxonomy keyword match strength |
| Code availability | 15 | GitHub repo presence + activity |
| Novelty | 15 | abstract distance from corpus |
| Venue prestige | 10 | CVPR/ICCV/NeurIPS/RAL/TPAMI > others |
| Author signal | 10 | h-index proxy from OpenAlex |
| Recency | 5 | exponential decay over 12 months |

Weights live in `src/lib/scoring/weights.ts` — pure data, A/B-testable.

## 9. LLM Digest Layer

For each top-N paper, generate a `Digest`:

```
- tldr: one-sentence promise
- key_contributions: 3–5 bullets
- relation_to_prior_work: short paragraph linking to cited papers we already know
- eccg_relevance: 1 paragraph — why this matters to the community
- open_questions: 2–3 follow-ups for discussion
- predicted_audience: who this hits hardest (algorithm / hardware / dataset folks)
```

Provider abstraction: `LLMProvider.generate(prompt, schema) -> Digest`. Anthropic Claude Haiku 4.5 primary; OpenAI fallback on 429/5xx. Fixture-based prompts so tests don't burn API credits.

## 10. Frontend (Three Views)

### 10.1 List view (`/`)
Zotero-style table: title, score, citations, venue, year, code badge, authors. Column sort, taxonomy filter, niche switcher. Sticky header.

### 10.2 Map view (`/map`)
Force-directed graph: nodes = papers (size = citations, color = taxonomy category), edges = citations within the corpus. Hover = paper tooltip; click = open Reader. Year-slider replay (Neuro_Vision_Map pattern). Built with `@visx/network` or D3.

### 10.3 Reader view (`/paper/[id]`)
ResearchForge-style detail: paper metadata header, LLM digest, score breakdown table, cited-by mini-graph, "open in arXiv" + code link, "related in corpus" rail.

### 10.4 Bar view (`/timeline`)
Stacked bar by venue × year, mirroring `Neuro_Vision_Map/bar.html` — secondary view, V1.1 if time.

## 11. Architecture

```
                            ┌──────────────────┐
                            │  Next.js 16 App  │
                            │  (App Router)    │
                            └──────┬───────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        /api/refresh         /api/papers         /api/digest/[id]
        (cron: 24h)         (list/filter)       (LLM generate)
              │                    │                    │
              └────────────────┬───┴────────────────────┘
                               ▼
                  ┌─────────────────────────┐
                  │   Pipeline orchestrator │
                  │   src/lib/pipeline.ts   │
                  └─────────────────────────┘
                               │
        ┌──────────┬───────────┼───────────┬──────────┐
        ▼          ▼           ▼           ▼          ▼
     Sources    Analysis    Scoring      LLM        Store
   (arxiv,    (velocity,  (rubric.ts) (anthropic,  (KV +
    s2,        outliers,                openai)    JSON
    openalex,  novelty,                            fixtures
    github)    code)                               + Vercel
                                                   Blob V1.1)
```

Storage V1: in-memory + JSON fixtures shipped in repo + Vercel KV for refreshed state. V1.1: Vercel Blob for paper PDFs.

## 12. Deployment

- **Vercel** (linked from `npx vercel link`).
- **Env vars** set via `vercel env add` or dashboard:
  - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (LLM)
  - `SEMANTIC_SCHOLAR_API_KEY`, `GITHUB_TOKEN` (sources, optional)
- **Cron** (`vercel.json`): `/api/refresh` daily at 06:00 UTC.
- **Preview** for every push; promote to prod manually after smoke-test.

## 13. Testing

- **Unit** (Vitest): every source fetcher with fixture HTTP responses; every analysis function; the scoring rubric.
- **Smoke**: `npm run seed` populates corpus from a checked-in fixture so the UI is testable with no keys.
- **Manual**: dev server check of all 3 views before deploying.

## 14. Milestones

| Milestone | Definition of done | Status |
|---|---|---|
| M0 — Scaffold | Next.js 16 builds, tailwind works, env wired | this commit |
| M1 — arXiv source | `arxiv.ts` fetches & parses, fixture test green | in progress |
| M2 — Pipeline | `pipeline.ts` ties source → score → digest | next |
| M3 — UI minimum | List view shows seeded papers | next |
| M4 — LLM digest | `/api/digest/[id]` returns structured Digest | next |
| M5 — Map view | Force graph renders the corpus | V1.0 |
| M6 — Deploy | Vercel preview live, env vars set, cron set | V1.0 |
| V1.1 — Bar view, Blob storage, Drive source | nice-to-haves | post-launch |

## 15. Risks

- **Rate limits** (Semantic Scholar without key = 100/5min) → cache aggressively, 24h TTL.
- **arXiv keyword false positives** ("event" is ambiguous) → require co-occurrence with `(camera|vision|neuromorphic|DVS|spike)`.
- **LLM cost drift** — Haiku 4.5 is cheap, but digest-per-paper × 50/week × 4 weeks = 200 calls/mo. Budget cap in env.
- **Drive folder empty** — designed for it; the Drive source slot stays dormant until populated.

## 16. Open questions

- Who reads the public digest besides Isaiah? If nobody, gate `/` behind auth and skip RSS.
- Should the niche be runtime-configurable (URL param) or compile-time (build per niche)?
- Vercel KV vs. checked-in JSON for the working corpus — KV simpler ops, JSON simpler debugging.
