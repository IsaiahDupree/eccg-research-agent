import { NextResponse } from "next/server";
import { assignRelevance } from "@/lib/analysis/relevance";
import { embedPapersIncremental, hasOpenAi } from "@/lib/embeddings";
import { readState, writeState } from "@/lib/google/state";
import { NICHES, findNiche, type NicheConfig } from "@/lib/niches";
import { sendTelegram, isTelegramConfigured, htmlEscape, tgLink } from "@/lib/notify";
import { fetchArxivPapers } from "@/lib/sources/arxiv";
import { fetchArxivRssPapers } from "@/lib/sources/arxiv_rss";
import type { Paper } from "@/lib/models";
import seedJson from "@/fixtures/seed_papers.json" with { type: "json" };
import eccgCorpus from "@/fixtures/eccg_corpus.json" with { type: "json" };

const SITE_URL = process.env.SITE_URL ?? "https://eccg-research-agent.vercel.app";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min budget — arXiv batches + retries (across niches)

import { CUSTOM_CORPUS_STATE, type UploadedRecord } from "@/lib/custom_corpus";

interface NicheReport {
  niche: string;
  searched: number;
  rss: number;
  deduped: number;
  added: number;
  sample: { id: string; title: string; category?: string }[];
}

/**
 * Daily refresh — runs via Vercel cron (vercel.json) at 06:00 UTC.
 *
 *   1. For each configured niche, pull the latest papers from arXiv search
 *      (per-niche keywords + categories) plus the per-category RSS feeds.
 *      The first niche (event_camera) also pulls the broad ECCG RSS feed
 *      so we keep parity with the prior single-niche behavior.
 *   2. Diff against bundled fixtures + previously-persisted state.
 *   3. Append the new ones to `eccg-state—custom-corpus.json` on Drive as
 *      `status: pending`. The team approves them via /review.
 *   4. Ping Telegram with a top-5 preview when total ≥ REFRESH_NOTIFY_MIN.
 *
 * Query params:
 *   ?niche=spike_camera  — limit to a single niche (skips the loop)
 *   ?token=…             — REFRESH_SECRET, also accepted as Authorization
 */
export async function GET(req: Request) {
  const expected = process.env.REFRESH_SECRET;
  const url = new URL(req.url);
  if (expected) {
    const provided =
      req.headers.get("authorization") ?? url.searchParams.get("token");
    if (provided !== `Bearer ${expected}` && provided !== expected) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const targetNicheParam = url.searchParams.get("niche");
  const targetNiches: NicheConfig[] = targetNicheParam
    ? [findNiche(targetNicheParam)]
    : NICHES;

  try {
    // Build the known-id set once — shared across all niches in this run.
    const knownIds = new Set<string>();
    for (const p of seedJson as { id: string }[]) knownIds.add(p.id);
    for (const s of eccgCorpus as { paper: { id: string } }[]) knownIds.add(s.paper.id);
    const existing = await readState<UploadedRecord[]>(CUSTOM_CORPUS_STATE, []);
    for (const e of existing) knownIds.add(e.paper.id);

    const allAdditions: UploadedRecord[] = [];
    const reports: NicheReport[] = [];
    const now = new Date().toISOString();

    for (const niche of targetNiches) {
      const searchPromise = fetchArxivPapers({
        niche: niche.slug,
        categories: niche.arxiv_categories,
        keywords: niche.core_keywords,
        maxResults: 100,
        sortBy: "submittedDate",
      }).catch(() => [] as Paper[]);

      // Only the founding niche uses the legacy ECCG-wide RSS feeds; sibling
      // niches rely purely on the keyword-filtered search API.
      const rssPromise =
        niche.slug === "event_camera"
          ? fetchArxivRssPapers().catch(() => [] as Paper[])
          : Promise.resolve([] as Paper[]);

      const [searchPapers, rssPapers] = await Promise.all([searchPromise, rssPromise]);

      const seen = new Set<string>();
      const fresh: Paper[] = [];
      for (const p of [...rssPapers, ...searchPapers]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        fresh.push(p);
      }
      assignRelevance(fresh);

      const additions: UploadedRecord[] = fresh
        .filter((p) => !knownIds.has(p.id))
        .filter((p) => (p.eccg_relevance ?? 0) >= 0.15 || niche.slug !== "event_camera")
        .map((p) => {
          knownIds.add(p.id); // prevent the next niche from re-adding the same id
          return {
            paper: p,
            score_base:
              (p.eccg_relevance ?? 0) * 55 +
              Math.exp(-p.months_since_publish / 12) * 35,
            uploaded_by: `cron:${niche.slug}`,
            uploaded_at: now,
            source_file: `arxiv-cron:${niche.slug}`,
            status: "pending",
          };
        });

      allAdditions.push(...additions);
      reports.push({
        niche: niche.slug,
        searched: searchPapers.length,
        rss: rssPapers.length,
        deduped: fresh.length,
        added: additions.length,
        sample: additions.slice(0, 3).map((a) => ({
          id: a.paper.id,
          title: a.paper.title,
          category: a.paper.eccg_category,
        })),
      });
    }

    if (allAdditions.length > 0) {
      await writeState(CUSTOM_CORPUS_STATE, [...allAdditions, ...existing]);
    }

    // Best-effort: embed the new papers so the offline rebuild can pick them
    // up next pass. Skipped silently when OPENAI_API_KEY is missing — never
    // blocks the cron's primary purpose (writing new papers to Drive).
    let embedReport: { embedded: number; skipped: number; failed: number } | null = null;
    if (allAdditions.length > 0 && hasOpenAi()) {
      try {
        const r = await embedPapersIncremental(
          allAdditions.map((a) => a.paper),
          allAdditions.length,
        );
        embedReport = {
          embedded: r.embedded.length,
          skipped: r.skipped.length,
          failed: r.failed.length,
        };
      } catch (err) {
        console.warn("incremental embed failed:", err);
      }
    }

    let telegram: { ok: boolean; error?: string } | null = null;
    const minToNotify = Number(process.env.REFRESH_NOTIFY_MIN ?? "1");
    if (allAdditions.length >= minToNotify && isTelegramConfigured()) {
      const list = allAdditions
        .slice(0, 5)
        .map((a, i) => {
          const link = a.paper.html_url || `${SITE_URL}/paper/${encodeURIComponent(a.paper.id)}`;
          const nicheSuffix = a.uploaded_by.startsWith("cron:")
            ? ` <i>[${htmlEscape(a.uploaded_by.slice(5))}]</i>`
            : "";
          return `${i + 1}. ${tgLink(a.paper.title, link)}${a.paper.eccg_category ? ` <i>(${htmlEscape(a.paper.eccg_category)})</i>` : ""}${nicheSuffix}`;
        })
        .join("\n");
      const more =
        allAdditions.length > 5 ? `\n<i>…and ${allAdditions.length - 5} more</i>` : "";
      const byNiche = reports
        .filter((r) => r.added > 0)
        .map((r) => `${r.niche}: <b>${r.added}</b>`)
        .join(", ");
      telegram = await sendTelegram(
        `<b>${allAdditions.length} new paper${allAdditions.length === 1 ? "" : "s"}</b> across ${reports.filter((r) => r.added > 0).length} niche${reports.filter((r) => r.added > 0).length === 1 ? "" : "s"} (${byNiche})\n\n${list}${more}\n\n${htmlEscape(SITE_URL)}/?sort=new`,
      );
    }

    return NextResponse.json({
      ok: true,
      refreshed_at: now,
      niches: reports,
      added: allAdditions.length,
      embed: embedReport,
      telegram,
      newest: allAdditions.slice(0, 5).map((a) => ({
        id: a.paper.id,
        title: a.paper.title,
        published_at: a.paper.published_at,
        category: a.paper.eccg_category,
        niche: a.uploaded_by.replace(/^cron:/, ""),
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
