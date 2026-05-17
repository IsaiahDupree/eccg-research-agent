import { NextResponse } from "next/server";
import { assignRelevance } from "@/lib/analysis/relevance";
import { readState, writeState } from "@/lib/google/state";
import { sendTelegram, isTelegramConfigured, htmlEscape, tgLink } from "@/lib/notify";
import { fetchArxivPapers } from "@/lib/sources/arxiv";
import { fetchArxivRssPapers } from "@/lib/sources/arxiv_rss";
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
 *   1. Pull the latest event-camera papers from BOTH the arXiv search API
 *      (catches anything we missed) and arXiv's per-category RSS feeds
 *      (faster, not rate-limited).
 *   2. Diff against bundled fixtures + previously-persisted state.
 *   3. Append the new ones to `eccg-state—custom-corpus.json` on Drive so
 *      `/`, `/whats-new`, RSS, and `/leaderboard` all pick them up.
 *   4. Ping Telegram with a top-5 preview when ≥ REFRESH_NOTIFY_MIN added.
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
    const [searchPapers, rssPapers] = await Promise.all([
      fetchArxivPapers({
        niche: process.env.ECCG_NICHE ?? "event_camera",
        maxResults: 100,
        sortBy: "submittedDate",
      }).catch(() => [] as Paper[]),
      fetchArxivRssPapers().catch(() => [] as Paper[]),
    ]);
    const seen = new Set<string>();
    const fresh: Paper[] = [];
    for (const p of [...rssPapers, ...searchPapers]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      fresh.push(p);
    }
    assignRelevance(fresh);

    // Cheap id-set dedup — don't re-run loadSeedPipeline (O(n²) TF-IDF;
    // would blow the 60s Hobby function limit).
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
          return `${i + 1}. ${tgLink(a.paper.title, url)}${a.paper.eccg_category ? ` <i>(${htmlEscape(a.paper.eccg_category)})</i>` : ""}`;
        })
        .join("\n");
      const more = additions.length > 5 ? `\n<i>…and ${additions.length - 5} more</i>` : "";
      telegram = await sendTelegram(
        `<b>${additions.length} new event-camera paper${additions.length === 1 ? "" : "s"}</b> on the ECCG agent\n\n${list}${more}\n\n${htmlEscape(SITE_URL)}/?sort=new`,
      );
    }

    return NextResponse.json({
      ok: true,
      refreshed_at: new Date().toISOString(),
      sources: {
        search: searchPapers.length,
        rss: rssPapers.length,
        deduped: fresh.length,
      },
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
