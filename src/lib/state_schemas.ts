/**
 * Runtime schemas for every Drive-backed state file.
 *
 * The Drive JSON could be corrupted (a manual edit, a half-written file
 * after a deploy reboot, a partial Drive sync). Without validation we just
 * trust the parsed shape and crash deep in a render. With validation we
 * parse-or-default — log the issue, return the bundled fallback, and let
 * the team patch the file later.
 *
 * Every loader in the codebase should run reads through `safeParse(schema,
 * raw, default)` before returning to callers.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared atoms
// ---------------------------------------------------------------------------

const IsoDate = z.string().min(1);

const AuthorSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  affiliation: z.string().optional(),
  h_index: z.number().optional(),
});

const VenueSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.enum(["conference", "journal", "preprint", "workshop", "unknown"]),
  prestige: z.number().optional(),
});

export const PaperSchema = z.object({
  id: z.string(),
  arxiv_id: z.string().optional(),
  doi: z.string().optional(),
  s2_id: z.string().optional(),
  openalex_id: z.string().optional(),
  title: z.string(),
  abstract: z.string().default(""),
  authors: z.array(AuthorSchema),
  venue: VenueSchema.optional(),
  published_at: IsoDate,
  categories: z.array(z.string()),
  pdf_url: z.string().optional(),
  html_url: z.string().optional(),
  citation_count: z.number().default(0),
  influential_citation_count: z.number().optional(),
  months_since_publish: z.number().default(0),
  citations_per_month: z.number().default(0),
  in_corpus_cited_by: z.number().optional(),
  in_corpus_replication: z.number().optional(),
  eccg_category: z.string().optional(),
  eccg_relevance: z.number().optional(),
});

// ---------------------------------------------------------------------------
// custom-corpus state
// ---------------------------------------------------------------------------

export const UploadedRecordSchema = z.object({
  paper: PaperSchema,
  score_base: z.number(),
  uploaded_by: z.string(),
  uploaded_at: IsoDate,
  source_file: z.string(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  reviewed_by: z.string().optional(),
  reviewed_at: IsoDate.optional(),
  review_note: z.string().optional(),
});

export const CustomCorpusSchema = z.array(UploadedRecordSchema);

// ---------------------------------------------------------------------------
// votes state
// ---------------------------------------------------------------------------

export const CollabVoteSchema = z.object({
  voter: z.string(),
  value: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string().optional(),
  voted_at: IsoDate,
});

export const VotesStateSchema = z.record(
  z.string(),
  z.object({
    upvotes: z.number().default(0),
    downvotes: z.number().default(0),
    net: z.number().default(0),
    voters: z.array(CollabVoteSchema).default([]),
  }),
);

// ---------------------------------------------------------------------------
// library + notes state
// ---------------------------------------------------------------------------

export const LibraryStateSchema = z.array(
  z.object({
    paper_id: z.string(),
    added_by: z.string(),
    added_at: IsoDate,
    tags: z.array(z.string()).optional(),
    reading_status: z.enum(["to_read", "reading", "read"]).optional(),
    status_updated_at: IsoDate.optional(),
  }),
);

export const NotesStateSchema = z.record(
  z.string(),
  z.array(
    z.object({
      id: z.string(),
      paper_id: z.string(),
      author: z.string(),
      body: z.string(),
      created_at: IsoDate,
    }),
  ),
);

// ---------------------------------------------------------------------------
// review-audit state
// ---------------------------------------------------------------------------

export const AuditEntrySchema = z.object({
  at: IsoDate,
  actor: z.string(),
  action: z.enum(["approve", "reject"]),
  paper_ids: z.array(z.string()),
  category: z.string().optional(),
  niche: z.string().optional(),
  note: z.string().optional(),
  source: z.enum(["single", "bulk_ids", "bulk_category"]),
});

export const AuditStateSchema = z.array(AuditEntrySchema);

// ---------------------------------------------------------------------------
// digest cache + custom-embeddings (read-through caches; loose validation)
// ---------------------------------------------------------------------------

export const DigestCacheSchema = z.record(
  z.string(),
  z.object({
    content_hash: z.string(),
    digest: z.unknown(),
    generated_at: IsoDate,
  }),
);

export const CustomEmbeddingsSchema = z.record(
  z.string(),
  z.object({
    vector: z.array(z.number()),
    hash: z.string(),
    embedded_at: IsoDate,
  }),
);

// ---------------------------------------------------------------------------
// safeParseDriveState — the actual loader integration point
// ---------------------------------------------------------------------------

interface ParseResult<T> {
  value: T;
  ok: boolean;
  errors?: string[];
}

/**
 * Validate raw Drive JSON against a schema. On failure log the issue,
 * return the fallback unchanged so the rest of the app can keep working.
 * Never throws.
 */
export function safeParseDriveState<T>(
  name: string,
  raw: unknown,
  schema: z.ZodType<T>,
  fallback: T,
): ParseResult<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { value: parsed.data, ok: true };
  const errors = parsed.error.issues.slice(0, 5).map(
    (i) => `${i.path.join(".")}: ${i.message}`,
  );
  console.warn(
    `[state-validation] ${name} failed schema check, using fallback:`,
    errors.join(" | "),
  );
  return { value: fallback, ok: false, errors };
}
