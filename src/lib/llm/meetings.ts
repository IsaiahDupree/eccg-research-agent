/**
 * LLM digest for a meeting transcript.
 *
 * Anthropic primary, OpenAI fallback (same pattern as the paper digest).
 * Caller supplies the transcript and the corpus catalog (so the LLM can
 * resolve mentions to known paper ids). Returns a structured MeetingDigest.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { extractMentionsLexical } from "../analysis/paper_mentions";
import { LlmUnavailableError } from "./provider";
import type { Meeting, MeetingDigest, Paper, PaperMention } from "../models";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_MODEL = "gpt-4o-mini";

function buildPrompt(meeting: Meeting, papers: Paper[]): string {
  // Pass a compact catalog so the model can attach mentions to known ids.
  const catalog = papers
    .slice(0, 60)
    .map((p) => `- ${p.id}  ${p.title}`)
    .join("\n");

  return `You are an analyst summarising a meeting of the Event Camera Community Group (ECCG).
Return STRICT JSON only, no commentary, no markdown fences.

Meeting metadata:
- Title: ${meeting.title}
- Held: ${meeting.held_at}
- Attendees: ${meeting.attendees.map((a) => a.name).join(", ") || "unknown"}

Known corpus (use these exact ids when referring to a paper):
${catalog}

Transcript (may be partial):
"""
${meeting.transcript.slice(0, 12000)}
"""

Return JSON in this exact shape:
{
  "tldr": "one sentence (<=30 words) describing what the meeting was about",
  "topics": ["3-6 short topic tags"],
  "paper_mentions": [
    { "paper_id": "<id from the catalog above>", "title": "<paper title>", "excerpt": "<short transcript quote>" }
  ],
  "action_items": [
    { "text": "<concise action>", "owner": "<person name or empty string>" }
  ],
  "open_questions": ["2-4 unresolved questions raised in the meeting"],
  "next_steps": ["2-4 follow-up plans the group committed to"]
}`;
}

function safeJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function generateAnthropic(meeting: Meeting, papers: Paper[]): Promise<MeetingDigest> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });
  const resp = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: buildPrompt(meeting, papers) }],
  });
  const text = resp.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("\n");
  return shapeDigest(meeting, papers, safeJson(text), `anthropic/${ANTHROPIC_MODEL}`);
}

async function generateOpenAI(meeting: Meeting, papers: Paper[]): Promise<MeetingDigest> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() });
  const resp = await client.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: buildPrompt(meeting, papers) }],
    temperature: 0.4,
  });
  const text = resp.choices[0]?.message?.content ?? "{}";
  return shapeDigest(meeting, papers, safeJson(text), `openai/${OPENAI_MODEL}`);
}

function shapeDigest(
  meeting: Meeting,
  papers: Paper[],
  raw: Record<string, unknown>,
  model: string,
): MeetingDigest {
  const asStr = (v: unknown) => (typeof v === "string" ? v : "");
  const asArr = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];

  const llmMentions = Array.isArray(raw.paper_mentions)
    ? (raw.paper_mentions as Record<string, unknown>[])
    : [];
  const knownIds = new Set(papers.map((p) => p.id));

  // Merge LLM-supplied mentions with lexical mentions, deduped by paper_id.
  const merged = new Map<string, PaperMention>();
  for (const m of llmMentions) {
    const id = asStr(m.paper_id);
    if (!knownIds.has(id)) continue;
    merged.set(id, {
      paper_id: id,
      title: asStr(m.title) || papers.find((p) => p.id === id)?.title || "",
      excerpt: asStr(m.excerpt).slice(0, 400),
    });
  }
  for (const m of extractMentionsLexical(meeting.transcript, papers)) {
    if (!merged.has(m.paper_id)) merged.set(m.paper_id, m);
  }

  const actionItems = Array.isArray(raw.action_items)
    ? (raw.action_items as Record<string, unknown>[])
        .map((a) => ({ text: asStr(a.text), owner: asStr(a.owner) || undefined }))
        .filter((a) => a.text.length > 0)
    : [];

  return {
    meeting,
    tldr: asStr(raw.tldr).trim(),
    topics: asArr(raw.topics),
    paper_mentions: Array.from(merged.values()),
    action_items: actionItems,
    open_questions: asArr(raw.open_questions),
    next_steps: asArr(raw.next_steps),
    generated_at: new Date().toISOString(),
    model,
  };
}

export async function generateMeetingDigest(
  meeting: Meeting,
  papers: Paper[],
): Promise<MeetingDigest> {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  if (!hasAnthropic && !hasOpenAI) throw new LlmUnavailableError();
  if (hasAnthropic) {
    try {
      return await generateAnthropic(meeting, papers);
    } catch {
      if (!hasOpenAI) throw new LlmUnavailableError();
    }
  }
  return await generateOpenAI(meeting, papers);
}

/** Static fixture digest for tests / no-key environments. */
export function fixtureMeetingDigest(meeting: Meeting, papers: Paper[]): MeetingDigest {
  const lex = extractMentionsLexical(meeting.transcript, papers);
  return {
    meeting,
    tldr: `${meeting.title} — ${lex.length} corpus papers discussed across ${meeting.attendees.length} attendees.`,
    topics: ["event-camera research", "open datasets", "community business"],
    paper_mentions: lex,
    action_items: [
      { text: "Share slides with the mailing list", owner: meeting.attendees[0]?.name },
    ],
    open_questions: [
      "Can the proposed benchmark be standardised across the community?",
      "Who's hosting the next session?",
    ],
    next_steps: [
      "Circulate transcript + slides within 48 hours.",
      "Set up a working group on the open dataset proposal.",
    ],
    generated_at: new Date().toISOString(),
    model: "fixture/static",
  };
}
