# eccg-research-agent

A research aggregator for the **Event Camera Community Group (ECCG)** — pulls papers from arXiv, hydrates with Semantic Scholar citation data, finds matching code on GitHub, scores via a transparent rubric, and renders LLM digests.

Built so event-camera researchers can spend their time **researching** rather than **researching how to research**. Sibling to [`yt-research-agent`](../yt-research-agent), same layered architecture, different domain.

## Quick start

```bash
# 1. Install
npm install

# 2. Env: copy keys from the autonomous-outreach-agent or paste your own
cp .env.example .env.local
# fill in ANTHROPIC_API_KEY (primary) and/or OPENAI_API_KEY (fallback)

# 3. Run dev server
npm run dev

# 4. Or: run the pipeline as a CLI
npm run refresh -- --fixture-digest   # no LLM call
npm run refresh                       # live LLM digests
```

## Architecture

```
                            Next.js 16 App Router
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
        /api/refresh           /api/papers           /api/digest/[id]
        (cron @ 06:00 UTC)     (list + filter)       (LLM digest, on demand)
                                     │
                            src/lib/pipeline.ts
                                     │
        ┌──────────┬─────────────────┼────────────────┬────────────┐
        ▼          ▼                 ▼                ▼            ▼
     Sources    Analysis          Scoring           LLM          State
   arxiv       citation_velocity  rubric.ts      anthropic      JSON
   s2          novelty            weights.ts     openai         (V1)
   github      relevance                                        Vercel KV
                                                                (V1.1)
```

Every layer is pure with respect to the layer below it. Sources are swappable. The rubric is data. The LLM is a renderer.

## Three views

- `/` — **List**: Zotero-style table, filterable, sortable.
- `/map` — **Map**: papers clustered by ECCG taxonomy; inspired by [Neuro_Vision_Map](https://hylz-2019.github.io/Neuro_Vision_Map/map.html).
- `/paper/[id]` — **Reader**: full digest, score breakdown, related papers.
- `/timeline` — stacked-bar publications by month × category.

## What's in the repo

- `src/lib/sources/` — arxiv, semantic_scholar, github, openalex
- `src/lib/analysis/` — citation_velocity, novelty (TF-IDF), relevance (taxonomy keyword match)
- `src/lib/scoring/` — rubric + weights (7 categories summing to 100)
- `src/lib/llm/` — Anthropic primary, OpenAI fallback, fixture path for tests
- `src/lib/taxonomy.ts` — 17 ECCG sub-areas, distilled from [uzh-rpg/event-based_vision_resources](https://github.com/uzh-rpg/event-based_vision_resources)
- `src/fixtures/seed_papers.json` — 10-paper seed corpus for instant first paint
- `docs/PRD.md` — full product spec

## Tests

```bash
npm test
```

Fixture-based: no API keys required for the test suite.

## Deploy

```bash
npx vercel link
npx vercel env add ANTHROPIC_API_KEY   # paste your key when prompted
npx vercel env add OPENAI_API_KEY
npx vercel deploy --prod
```

`vercel.json` registers a daily cron at 06:00 UTC against `/api/refresh`.

## License

MIT.
