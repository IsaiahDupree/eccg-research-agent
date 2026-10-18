/**
 * Domain models for the ECCG research agent.
 *
 * Plain types — no business logic. Analysis lives in `analysis/`. Models are
 * JSON-serialisable so caches can round-trip.
 *
 * Naming mirrors yt-research-agent/src/youtube_research_agent/models.py to make
 * the structural parallel obvious: Video↔Paper, Channel↔Venue, RedditSignal↔RepoSignal,
 * Outlier→PaperOutlier, ScoredIdea→ScoredPaper, ContentBrief→PaperDigest.
 */

export type Niche = "event_camera" | "neuromorphic" | "spike_camera" | string;

// ---------------------------------------------------------------------------
// Papers
// ---------------------------------------------------------------------------

export interface Author {
  id?: string;        // OpenAlex / S2 author id
  name: string;
  affiliation?: string;
  h_index?: number;
}

export interface Venue {
  id?: string;
  name: string;       // "CVPR", "TPAMI", "arXiv preprint"
  type: "conference" | "journal" | "preprint" | "workshop" | "unknown";
  prestige?: number;  // 0-10, derived from a curated list
}

export interface Paper {
  id: string;             // canonical id, prefer arXiv id; fallback DOI; fallback S2 id
  arxiv_id?: string;
  doi?: string;
  s2_id?: string;
  openalex_id?: string;
  title: string;
  abstract: string;
  authors: Author[];
  venue?: Venue;
  published_at: string;   // ISO 8601
  categories: string[];   // e.g. ["cs.CV", "cs.RO"]
  pdf_url?: string;
  html_url?: string;
  // derived
  citation_count: number;
  influential_citation_count?: number;
  months_since_publish: number;
  citations_per_month: number;
  // in-corpus citation graph (count of other corpus papers referencing this one)
  in_corpus_cited_by?: number;
  in_corpus_replication?: number; // subset cited as methodology / result
  // taxonomy assignment (UZH-RPG sub-area)
  eccg_category?: string;
  eccg_relevance?: number; // 0-1
}

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

export interface RepoSignal {
  url: string;
  full_name: string;      // "owner/repo"
  stars: number;
  forks: number;
  last_pushed_at: string; // ISO
  language?: string;
  hours_since_push: number;
  // joined back to paper if we found one
  paper_id?: string;
}

// ---------------------------------------------------------------------------
// Trending / corpus
// ---------------------------------------------------------------------------

export interface CitationVelocitySignal {
  paper_id: string;
  citations_per_month: number;
  // multiplier relative to venue baseline
  venue_baseline_cpm: number;
  multiplier: number;     // citations_per_month / venue_baseline_cpm
}

export interface NoveltySignal {
  paper_id: string;
  novelty: number;        // 0-1, distance from corpus centroid in abstract embedding space (TF-IDF proxy for V1)
  nearest_paper_id?: string;
  nearest_similarity?: number;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface CategoryScore {
  name: string;
  raw: number;        // 0-10
  weight: number;     // weight from rubric
  rationale: string;
}

export function weightedContribution(c: CategoryScore): number {
  return (c.raw * c.weight) / 10;
}

export interface ScoredPaper {
  paper: Paper;
  total: number;            // 0-100
  categories: CategoryScore[];
  repo?: RepoSignal;
}

// ---------------------------------------------------------------------------
// Digest (LLM output)
// ---------------------------------------------------------------------------

export interface PaperDigest {
  scored: ScoredPaper;
  tldr: string;
  key_contributions: string[];
  relation_to_prior_work: string;
  eccg_relevance: string;
  open_questions: string[];
  predicted_audience: string;
  generated_at: string;
  model: string;            // which provider+model produced this
}

// ---------------------------------------------------------------------------
// Pipeline I/O
// ---------------------------------------------------------------------------

export interface RawSignals {
  papers: Paper[];
  repos: RepoSignal[];
  venues: Record<string, Venue>;
  // derived (filled after analysis)
  velocities: CitationVelocitySignal[];
  novelties: NoveltySignal[];
}

export interface PipelineResult {
  niche: Niche;
  raw: RawSignals;
  scored: ScoredPaper[];
  digests: PaperDigest[];
}

// ---------------------------------------------------------------------------
// Meetings / recordings
// ---------------------------------------------------------------------------

export interface MeetingAttendee {
  name: string;
  affiliation?: string;
}

export interface PaperMention {
  paper_id: string;       // matches Paper.id in the corpus
  title: string;          // captured here so links survive without joining
  excerpt: string;        // a short transcript snippet around the mention
  start_seconds?: number; // optional timestamp into the audio
}

export interface ActionItem {
  text: string;
  owner?: string;         // who said they'd do it
}

export interface Meeting {
  id: string;             // stable, slug-style id
  title: string;          // "ECCG May 2026 — Event-Based SLAM Session"
  held_at: string;        // ISO 8601
  duration_seconds?: number;
  source: "drive" | "manual" | "fixture";
  drive_file_id?: string; // when source=drive
  attendees: MeetingAttendee[];
  transcript: string;     // raw text (may be empty until processed)
  language?: string;      // BCP-47, e.g. "en"
}

export interface MeetingDigest {
  meeting: Meeting;
  tldr: string;                  // 1 sentence on the meeting
  topics: string[];              // 3–6 high-level topics discussed
  paper_mentions: PaperMention[];// papers from corpus that came up
  action_items: ActionItem[];
  open_questions: string[];
  next_steps: string[];
  generated_at: string;
  model: string;
}

