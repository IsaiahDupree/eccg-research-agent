import { NextResponse } from "next/server";
import { assignRelevance } from "@/lib/analysis/relevance";
import { readState, writeState } from "@/lib/google/state";
import { sendTelegram, isTelegramConfigured, tgEscape } from "@/lib/notify";
import { fetchArxivPapers } from "@/lib/sources/arxiv";
import type { Paper } from "@/lib/models";
import seedJson from "@/fixtures/seed_papers.json" with { type: "json" };
import eccgCorpus from "@/fixtures/eccg_corpus.json" with { type: "json" };

const SITE_URL = process.env.SITE_URL ?? "https://eccg-research-agent.vercel.app";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min budget — arXiv batches + retries

const CUSTOM_CORPUS_STATE = "custom-corpus";

interface UploadedRecord {
  paper: Paper;
  score_base: number;
  uploaded_by: string;
  uploaded_at: string;
  source_file: string;
}

/**
 * Daily refresh — runs via Vercel cron (vercel.json) at 06:00 UTC.
 *
 *  1. Pull the most-recent batch of event-camera papers from arXiv.
 *  2. Diff against the static corpus + previously-persisted uploads.
 *  3. Persist the deltas to the shared Drive state file so they show up on
 *     `/` and `/whats-new` on the next page load — for everyone on the team.
 *
 * No LLM digest here (those are generated on-demand per paper).
 */
export async function GET(req: Request) {
  const expected = process.env.REFRESH_SECRET;
  if (expected) {
    const provided =
      req.headers.get("authorization") ?? new URL(req.url).searchParams.get("token");
    if (provided !== `Bearer ${expected}` && provided !== expected) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const fresh = await fetchArxivPapers({
      niche: process.env.ECCG_NICHE ?? "event_camera",
      maxResults: 100,
      sortBy: "submittedDate",
    });
    assignRelevance(fresh);

    // Dedup against bundled fixtures + Drive state — but DON'T re-run the
    // full pipeline (that runs O(n²) TF-IDF on 1,100 papers and pushes us
    // past Vercel's 60s function limit).
    const knownIds = new Set<string>();
    for (const p of seedJson as { id: string }[]) knownIds.add(p.id);
    for (const s of eccgCorpus as { paper: { id: string } }[]) knownIds.add(s.paper.id);
    const existing = await readState<UploadedRecord[]>(CUSTOM_CORPUS_STATE, []);
    for (const e of existing) knownIds.add(e.paper.id);

    const additions: UploadedRecord[] = fresh
      .filter((p) => !knownIds.has(p.id) && (p.eccg_relevance ?? 0) >= 0.15)
      .map((p) => ({
        paper: p,
        score_base:
          (p.eccg_relevance ?? 0) * 55 +
          Math.exp(-p.months_since_publish / 12) * 35,
        uploaded_by: "cron",
        uploaded_at: new Date().toISOString(),
        source_file: "arxiv-cron",
      }));

    if (additions.length > 0) {
      await writeState(CUSTOM_CORPUS_STATE, [...additions, ...existing]);
    }

    let telegram: { ok: boolean; error?: string } | null = null;
    const minToNotify = Number(process.env.REFRESH_NOTIFY_MIN ?? "1");
    if (additions.length >= minToNotify && isTelegramConfigured()) {
      const list = additions
        .slice(0, 5)
        .map((a, i) => {
          const url = a.paper.html_url || `${SITE_URL}/paper/${encodeURIComponent(a.paper.id)}`;
          return `${i + 1}. [${tgEscape(a.paper.title)}](${url})${a.paper.eccg_category ? ` _(${a.paper.eccg_category})_` : ""}`;
        })
        .join("\n");
      const more = additions.length > 5 ? `\n_…and ${additions.length - 5} more_` : "";
      telegram = await sendTelegram(
        `*${additions.length} new event-camera paper${additions.length === 1 ? "" : "s"}* on the ECCG agent\n\n${list}${more}\n\n${SITE_URL}/?sort=new`,
      );
    }

    return NextResponse.json({
      ok: true,
      refreshed_at: new Date().toISOString(),
      fetched: fresh.length,
      added: additions.length,
      telegram,
      newest: additions.slice(0, 5).map((a) => ({
        id: a.paper.id,
        title: a.paper.title,
        published_at: a.paper.published_at,
        category: a.paper.eccg_category,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
