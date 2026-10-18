# PRD v2 — ECCG Research Platform

**Status:** Draft for the 2026-05-22 sync.
**Source-of-truth:** [`SOURCE_TRANSCRIPT.md`](./SOURCE_TRANSCRIPT.md) — every requirement in this doc is anchored to a Rick / Alexis / Isaiah quote.
**Supersedes:** [`PRD.md`](./PRD.md) (the speculative pre-conversation draft).

---

## 1. Pitch

A **collaborative research platform** that takes a community-shared corpus of papers (today: event-camera research; later: any domain) and turns it into a continuously-updated, ranked, relationship-aware knowledge base — so researchers spend time *studying* findings, not *finding* what to study.

> "It was really a quest for efficiency in my research process — to spend my time not in the research of research, but to actually spend it in studying it." — **Rick**

## 2. Problem

The ECCG community currently has:

- A manually-compiled spreadsheet of **~4,500 links**, scraped from 6+ GitHub repositories (UZH-RPG event-based vision resources, et al.).
- An ageing snapshot — *"already outdated"* the moment it was finished.
- No way to express *constraints* like "event-camera + GPU + aerial robotics" without reading through it.
- No way to detect duplicates, derivatives, or paper-to-paper relationships.
- LLM tools (NotebookLM, ChatGPT) that **summarise but don't compare**, and reference managers (Zotero, Mendeley) that **catalogue but don't rank**.

The cost is paid in researcher hours wasted on bibliographic plumbing.

## 3. Users

Three named seats in the founding group:

| Persona | Role | Constraints |
|---|---|---|
| **Rick** | Project initiator, conceptual lead, ECCG community organiser | Needs the spreadsheet replaced; can spec & test but won't build |
| **Isaiah Dupree** (us) | Engineer, builder of [ResearchForge](https://www.researchforge.app) | Has the stack + relevant prior code; available Fridays |
| **Alexis** | Domain expert, contributor on freshness/correctness | Email-only during conference season |

Secondary audience: the **broader ECCG community** + adjacent research groups (neuromorphic, spike-camera, business-research teams who hit the same workflow).

## 4. Scope

### In scope (V1 — by 2026-06-30)

1. **Multi-source aggregator** — arXiv, Semantic Scholar, OpenAlex, GitHub, the UZH-RPG curated list, Rick's spreadsheet, and Drive-uploaded recordings/notes.
2. **Deduplication & relationship engine** — same-paper-different-source detection, derivative/related-work edges, side-by-side compare.
3. **Constraint-based search** — multi-tag intersection ("event camera AND GPU AND aerial robotics"), not free-text-only.
4. **Transparent ranking** — community-aware score with a published rubric; no black-box.
5. **Tag-based collaborative library** — one resource, many projects/threads, no duplication on share.
6. **Meeting ingest** — Drive folder of recordings → transcript → digest → linked papers (already shipped).
7. **Continuous freshness signal** — when a paper has been superseded, replicated, or contradicted, the score reflects it.

### Out of scope (V1)

- Hosting paper PDFs (we link to canonical sources — *"a meta-aggregator … pointing to where the original sources are"*).
- Submitting to peer-reviewed journals.
- Native mobile.
- More than the founding 3 seats for collaborative libraries (multi-tenant is V2).

### Future scope (V2+)

- Generalise to other research niches: business research, medical, life sciences (*"the need is applicable to really any research project"*).
- Native Drive doc / Slack / Discord plug-ins.
- Custom rubrics per team (today: one rubric for everyone).
- Replication-graph: paper → paper-that-replicated-it → reproducibility score.

## 5. Capabilities & status

The current deployment already implements 60 % of V1. The capability table makes the gap explicit.

| # | Capability | Transcript anchor | Status today |
|---|---|---|---|
| C1 | Multi-source acquisition (arXiv, S2, GitHub) | "It's a meta-aggregator pointing to where the original sources are" | ✅ Live |
| C2 | UZH-RPG taxonomy ingest | "GitHub repository — list of articles compiled into the spreadsheet" | 🟡 Taxonomy keywords live; full 4,500-link ingest pending |
| C3 | Constraint-based filter ("event camera AND GPU AND aero") | "Event cameras that are GPU that are for aero robotics — I create inquiry parameters" | 🟡 Category filter only — multi-tag AND/OR not yet |
| C4 | Transparent rubric ranking (0-100, 7 axes) | "Get a relevancy score … some methodology to show why others are not" | ✅ Live (`/about` documents the weights) |
| C5 | Community-rated relevance (hackr.io pattern) | "User-submitted links … relevancy score … why others are not" | ❌ Not yet — V1 |
| C6 | Deduplication / same-paper-different-source | "Is this the same published paper but just from a different source?" | ❌ Not yet — V1 |
| C7 | Relationship edges (derivative, related, replicated) | "Create relationships between papers" | 🟡 TF-IDF nearest-neighbour exists, no edge UI |
| C8 | Compare-and-contrast view | "Compare and contrast — that's something a lot of LLMs don't do" | ❌ Not yet — V1 |
| C9 | Tag-based shared libraries | "One single resource in multiple projects, multiple discussion threads" | 🟡 Library is local-only, single-user |
| C10 | Freshness signal ("small brain on top") | "Something on top that's constantly being proofed or challenged" — Alexis | ❌ Not yet — V1 |
| C11 | Meeting ingest from Drive | the call itself! | ✅ Live, verified end-to-end on `Delaney Dr 4.m4a` |
| C12 | Institutions geo view | "Map shows growth trend … kind of a market outlook" | ✅ Live |
| C13 | Timeline / publications-by-venue bar | "Different research papers, publications, conferences" | ✅ Live |
| C14 | Personal notes per resource | "Make notes in there and those are shared" | ❌ Not yet — V1 |
| C15 | Comment threads per paper | "Multiple projects, multiple discussion threads" | ❌ Not yet — V1 |
| C16 | Public RSS / email digest | "Keep the platform updated with new research" | ❌ Not yet — V1 |

## 6. Architecture (where each capability lives)

```
                 ┌────────────────────────────────────────────────────┐
                 │  UI — Next.js 16 App Router on Vercel              │
                 │   List · Map · Timeline · Institutions ·           │
                 │   Categories · Learn · Library · Meetings ·        │
                 │   Paper detail · Compare (new)                     │
                 └───────────────────────┬────────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
      /api/papers,             /api/meetings*,             /api/ingest-source
      /api/digest/[id],        /api/meetings/ingest        (new — for
      /api/refresh             (Drive + Whisper +          GitHub-list +
                               LLM digest, live)            spreadsheet ingest)
              │                          │                          │
              └──────────────────────────┼──────────────────────────┘
                                         │
                              src/lib/pipeline.ts
                                         │
   ┌──────────────┬──────────────┬──────┴──────┬──────────────┬─────────────┐
   ▼              ▼              ▼             ▼              ▼             ▼
Sources       Analysis        Scoring        LLM         Persistence    Collab
arxiv         citation_vel.   rubric         Anthropic   Vercel KV       Library
s2            novelty         weights        OpenAI      (V1.1)         Notes
github        relevance       community-     Whisper     Vercel Blob    Comments
openalex      *similarity*    score (new)                (transcripts)  (new)
drive         *freshness*                                                 (new)
uzh-rpg-list  (new)
spreadsheet
```

New / changed modules in V1:

- `src/lib/analysis/similarity.ts` — embedding-based paper relationships (replaces TF-IDF-only).
- `src/lib/analysis/dedup.ts` — DOI + arXiv-id + title-hash canonicalisation.
- `src/lib/analysis/freshness.ts` — "is this superseded?" detector (later replication).
- `src/lib/scoring/community.ts` — user-vote-weighted axis on the rubric.
- `src/lib/persistence/kv.ts` — Vercel KV adapter for the corpus + libraries + votes.
- `src/lib/sources/curated_list.ts` — parse the UZH-RPG awesome-list markdown into Papers.
- `src/lib/sources/spreadsheet.ts` — import Rick's CSV/XLSX.

## 7. Data model deltas (vs current)

```ts
// existing additions only — full schema in src/lib/models.ts
interface Paper {
  // …existing fields…
  canonical_id: string;          // single id per "same paper, any source"
  related_paper_ids: string[];   // V1: similarity-derived; V2: hand-curated
  derivative_of?: string;        // canonical_id of the parent work
  freshness_score: number;       // 0-1, decays as the field moves on
  community_score: number;       // 0-1, weighted vote
  notes: PaperNote[];            // attached, scoped by library
}

interface PaperNote {
  author: string;
  library_id: string;            // personal | "team-eccg" | etc.
  body: string;                  // markdown
  created_at: string;
  visibility: "private" | "library" | "public";
}

interface Library {
  id: string;
  name: string;
  members: { name: string; role: "owner" | "editor" | "viewer" }[];
  paper_ids: string[];           // references, no duplication
  tags: string[];                // shared tag namespace
}
```

## 8. Ranking — community-aware rubric (v2)

V1 rubric was 7 axes summing to 100. The transcript adds two community signals:

| Axis | Weight | Source |
|---|---:|---|
| Citation velocity | 18 | Semantic Scholar |
| ECCG relevance (taxonomy match) | 22 | Our keywords |
| Code availability | 12 | GitHub heuristic |
| Novelty (vs corpus) | 12 | Embedding distance |
| Venue prestige | 8 | Curated venue tier |
| Author signal (h-index) | 8 | OpenAlex / S2 |
| Recency | 5 | Publish date |
| **Community vote** *(new)* | 10 | Logged-in users vote ±1 with reason |
| **Freshness / superseded** *(new)* | 5 | Decay + supersession-by-newer-work |

Weights are tuneable per-library in V2; V1 ships the table above.

## 9. Phasing

### Phase A — "make the existing thing trustworthy" (1–2 weeks)
1. **Persist** ingested meetings (KV-backed `/meetings/[id]`).
2. **Ingest the UZH-RPG awesome-list** (~500 papers from the canonical Markdown) so the corpus jumps from 10 to ~500.
3. **Multi-tag AND filter** on the list view (`?category=slam&category=control_robotics`).
4. **Compare view** (`/compare?ids=A,B,C`) — side-by-side scores + abstracts + linked code.

### Phase B — "make it collaborative" (2–3 weeks)
5. **Shared libraries** with simple auth (Vercel-OIDC or magic-link). Three seats: Rick, Isaiah, Alexis.
6. **Notes per paper, scoped to a library**.
7. **Community vote** on relevance + freshness, with reason field.
8. **Spreadsheet import** — paste Rick's CSV → corpus.

### Phase C — "make it generalisable" (subsequent)
9. **Niche switcher** at build time → reuse the pipeline for non-event-camera research.
10. **Public RSS** + weekly email digest of new high-score papers in your tagged interests.
11. **Replication graph** (V2 cap C10 done properly).

## 10. Success metrics

V1 ships if, on **2026-06-30**:

- The corpus contains **≥ 500 event-camera papers** (today: 10 fixture).
- Rick can search "event camera + GPU + aerial robotics" and get ≤ 20 results, ranked.
- Compare-view renders 3 papers side-by-side with scores + abstracts in < 1 s.
- Alexis can drop a note on a paper that Rick sees.
- One ingested meeting per month routinely produces a digest with ≥ 2 corpus paper mentions.

## 11. Risks

- **OAuth credit exhaustion** — Anthropic + OpenAI have both hit billing limits in this session. Budget alerts must be set in both consoles before V1.
- **arXiv keyword false positives** — handled in V1 today; tune as corpus grows.
- **Rick's spreadsheet schema may not be CSV-clean** — manual one-pass import in Phase A.
- **Scope creep (Rick acknowledged this on the call)** — Phase A is fixed; further work waits on Phase B.

## 12. Decisions still open (for 2026-05-22 sync)

1. Where does the canonical PRD live? — **proposed:** this file (Markdown, in repo) is canonical; a Drive doc mirror is a courtesy.
2. Auth provider for Phase B — Clerk (heavy), Vercel-OIDC (light), or magic-link only?
3. Vote semantics — `±1` (Reddit) or `1-5` (Goodreads)?
4. Niche switcher API — build-time env or runtime URL param?
5. Replication graph — V1.1 nice-to-have or V2 blocker?

## 13. Glossary

- **Canonical paper** — one logical work; many physical sources (arXiv preprint + CVPR camera-ready + lab page).
- **Derivative** — a paper that materially extends, refutes, or replicates a parent canonical paper.
- **Library** — a named collection of paper references with shared tags + members. Not a physical storage unit; just a set.
- **Note** — a piece of text attached to a paper, scoped to a library, with a visibility flag.
- **Freshness** — a 0-1 signal: 1 = state-of-the-art, 0 = fully superseded.
