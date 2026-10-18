/**
 * 2-paragraph LLM commentary for the weekly digest.
 *
 * Takes the structured DigestPayload and asks the LLM to surface the
 * narrative the team should pay attention to — not the raw stats (which
 * appear below), but the *why-it-matters*. Anthropic primary, OpenAI
 * fallback, silent fixture when both unavailable.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_MODEL = "gpt-4o-mini";

export interface CommentaryInput {
  window_days: number;
  new_papers: { title: string; category?: string; uploaded_by: string }[];
  new_library: { paper_id: string; added_by: string }[];
  new_notes: { paper_id: string; author: string; body: string }[];
  top_voted: { paper_id: string; net: number; up: number; down: number }[];
}

function prompt(input: CommentaryInput): string {
  const titles = input.new_papers
    .slice(0, 10)
    .map((p, i) => `${i + 1}. ${p.title}${p.category ? ` [${p.category}]` : ""}`)
    .join("\n");
  const notes = input.new_notes
    .slice(0, 5)
    .map((n) => `- ${n.author}: ${n.body.slice(0, 200)}`)
    .join("\n");
  const voted = input.top_voted
    .slice(0, 5)
    .map((v) => `- ${v.paper_id} net ${v.net >= 0 ? "+" : ""}${v.net}`)
    .join("\n");

  return `You are writing a short editorial intro for the ECCG (Event Camera
Community Group) weekly research digest, covering the last ${input.window_days}
days. The team is small (Isaiah, Rick, Alexis), the audience is event-camera
researchers.

Write **two short paragraphs** in plain Markdown (no headings, no bullets).

Paragraph 1: What's the headline this week? Surface the most important new
paper(s) and any cross-cutting themes. Skip generic platitudes.

Paragraph 2: What should the team actually look at? Reference notes, votes,
or library activity if they signal something worth pursuing. If the data is
thin, say so honestly — don't pad.

Keep it crisp. Around 80-120 words total. No emoji. Do not start with "This
week" — vary the opening.

=== DATA ===

New papers (${input.new_papers.length}):
${titles || "(none)"}

Most-voted (${input.top_voted.length}):
${voted || "(none)"}

Recent notes (${input.new_notes.length}):
${notes || "(none)"}

Library activity: ${input.new_library.length} saves.`;
}

export class CommentaryUnavailableError extends Error {
  constructor() {
    super("LLM_UNAVAILABLE");
  }
}

async function fromAnthropic(input: CommentaryInput): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });
  const resp = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: prompt(input) }],
  });
  return resp.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("\n")
    .trim();
}

async function fromOpenAI(input: CommentaryInput): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() });
  const resp = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: "user", content: prompt(input) }],
    temperature: 0.6,
    max_tokens: 400,
  });
  return (resp.choices[0]?.message?.content ?? "").trim();
}

/**
 * Generate the commentary. Returns the markdown text. Throws
 * CommentaryUnavailableError when no LLM is configured.
 */
export async function generateCommentary(input: CommentaryInput): Promise<{ text: string; model: string }> {
  const hasAnth = !!process.env.ANTHROPIC_API_KEY;
  const hasOA = !!process.env.OPENAI_API_KEY;
  if (!hasAnth && !hasOA) throw new CommentaryUnavailableError();
  let anthropicError: unknown;
  if (hasAnth) {
    try {
      const text = await fromAnthropic(input);
      if (text) return { text, model: `anthropic/${ANTHROPIC_MODEL}` };
    } catch (e) {
      anthropicError = e;
      if (!hasOA) throw e;
    }
  }
  const text = await fromOpenAI(input);
  return {
    text,
    model: `openai/${OPENAI_MODEL}${anthropicError ? " (fallback)" : ""}`,
  };
}
