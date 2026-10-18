/**
 * LLM provider abstraction — Anthropic primary, OpenAI fallback.
 *
 * `generateDigest()` is the only call surface the rest of the codebase needs.
 * The contract is: take a ScoredPaper, return a PaperDigest. Failure modes:
 *   - missing keys → throw "LLM_UNAVAILABLE" (caller can degrade).
 *   - rate limit / 5xx → try the other provider once.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { PaperDigest, ScoredPaper } from "../models";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_MODEL = "gpt-4o-mini";

export class LlmUnavailableError extends Error {
  constructor() {
    super("LLM_UNAVAILABLE: no provider has a key configured");
  }
}

function digestPrompt(s: ScoredPaper): string {
  return `You are summarizing an event-camera paper for the Event Camera Community Group (ECCG).
Return STRICT JSON, no commentary, no markdown fences.

Paper:
- Title: ${s.paper.title}
- Authors: ${s.paper.authors.map((a) => a.name).join(", ")}
- Venue: ${s.paper.venue?.name ?? "arXiv preprint"}
- Published: ${s.paper.published_at}
- arXiv: ${s.paper.arxiv_id ?? "—"}
- Categories: ${s.paper.categories.join(", ")}
- Citations: ${s.paper.citation_count}
- ECCG taxonomy match: ${s.paper.eccg_category ?? "unclassified"}

Abstract:
${s.paper.abstract.slice(0, 2000)}

Return JSON with this exact shape:
{
  "tldr": "one sentence (≤ 30 words) describing the paper's promise to a busy researcher",
  "key_contributions": ["3 to 5 bullets, each ≤ 20 words"],
  "relation_to_prior_work": "1 short paragraph (≤ 80 words) — what this builds on, what it differs from",
  "eccg_relevance": "1 paragraph (≤ 100 words) — why this matters specifically to the event-camera community",
  "open_questions": ["2 or 3 follow-up questions a reader might want answered next"],
  "predicted_audience": "one phrase (≤ 12 words) — e.g., 'event-camera SLAM practitioners' or 'neuromorphic-hardware researchers'"
}`;
}

function parseJsonStrict(text: string): Record<string, unknown> {
  // Allow models that wrap in ```json fences
  const cleaned = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  return JSON.parse(cleaned) as Record<string, unknown>;
}

async function generateAnthropic(s: ScoredPaper): Promise<PaperDigest> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });
  const resp = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: digestPrompt(s) }],
  });
  const text = resp.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("\n");
  return shapeDigest(s, parseJsonStrict(text), `anthropic/${ANTHROPIC_MODEL}`);
}

async function generateOpenAI(s: ScoredPaper): Promise<PaperDigest> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() });
  const resp = await client.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: digestPrompt(s) }],
    temperature: 0.4,
  });
  const text = resp.choices[0]?.message?.content ?? "{}";
  return shapeDigest(s, parseJsonStrict(text), `openai/${OPENAI_MODEL}`);
}

function shapeDigest(
  s: ScoredPaper,
  raw: Record<string, unknown>,
  model: string,
): PaperDigest {
  const asStr = (v: unknown) => (typeof v === "string" ? v : "");
  const asArr = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  return {
    scored: s,
    tldr: asStr(raw.tldr).trim(),
    key_contributions: asArr(raw.key_contributions),
    relation_to_prior_work: asStr(raw.relation_to_prior_work).trim(),
    eccg_relevance: asStr(raw.eccg_relevance).trim(),
    open_questions: asArr(raw.open_questions),
    predicted_audience: asStr(raw.predicted_audience).trim(),
    generated_at: new Date().toISOString(),
    model,
  };
}

export async function generateDigest(s: ScoredPaper): Promise<PaperDigest> {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  if (!hasAnthropic && !hasOpenAI) throw new LlmUnavailableError();

  let anthropicError: unknown;
  if (hasAnthropic) {
    try {
      return await generateAnthropic(s);
    } catch (err) {
      anthropicError = err;
      if (!hasOpenAI) throw err;
      console.warn("anthropic failed, falling back to openai:", err);
    }
  }
  try {
    return await generateOpenAI(s);
  } catch (openaiErr) {
    const msg = [
      anthropicError ? `anthropic: ${describeError(anthropicError)}` : null,
      `openai: ${describeError(openaiErr)}`,
    ].filter(Boolean).join("; ");
    throw new Error(msg);
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    return status ? `${status} ${err.message}` : err.message;
  }
  return String(err);
}

/** Test-only: stub digest used in fixtures so tests don't need API keys. */
export function fixtureDigest(s: ScoredPaper): PaperDigest {
  return {
    scored: s,
    tldr: `${s.paper.title.split(":")[0]} — fixture digest (no LLM call made).`,
    key_contributions: [
      "Introduces a method for the event-camera task in the abstract.",
      "Reports state-of-the-art results on at least one benchmark.",
      "Releases code or model weights (per fixture).",
    ],
    relation_to_prior_work:
      "Builds on prior event-camera work in the same sub-area; differs by replacing the standard pipeline with the proposed method.",
    eccg_relevance:
      "Directly relevant to the ECCG community working in the matched taxonomy slug; uses canonical event-camera signals.",
    open_questions: [
      "How does the method scale to higher resolutions?",
      "What is the failure mode on noisy real-world recordings?",
    ],
    predicted_audience: "event-camera practitioners in the matched sub-area",
    generated_at: new Date().toISOString(),
    model: "fixture/static",
  };
}
