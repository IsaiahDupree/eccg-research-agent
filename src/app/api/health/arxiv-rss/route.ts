/**
 * Health check for the arXiv RSS feeds we depend on for the refresh cron.
 *
 *   GET /api/health/arxiv-rss              — JSON status per category
 *   GET /api/health/arxiv-rss?notify=1     — also Telegram if anything broken
 *
 * Cron (vercel.json) runs this once a day so we hear about a broken feed
 * before the daily refresh quietly stops returning new papers.
 */

import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { sendTelegram, isTelegramConfigured } from "@/lib/notify";

export const runtime = "nodejs";

const FEEDS = ["cs.CV", "cs.RO", "cs.NE"];
const RSS_BASE = "https://rss.arxiv.org/atom";

interface FeedHealth {
  category: string;
  url: string;
  http_status: number | "fetch_error";
  parse_ok: boolean;
  item_count: number;
  last_updated?: string;
  error?: string;
  warning?: string;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

async function probe(cat: string): Promise<FeedHealth> {
  const url = `${RSS_BASE}/${cat}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/atom+xml,application/xml,text/xml,*/*",
        "User-Agent": "eccg-research-agent/1.0 (health-check)",
      },
    });
    if (!res.ok) {
      return {
        category: cat,
        url,
        http_status: res.status,
        parse_ok: false,
        item_count: 0,
        error: `HTTP ${res.status}`,
      };
    }
    const xml = await res.text();
    try {
      const parsed = parser.parse(xml) as {
        feed?: { entry?: unknown | unknown[]; updated?: string };
      };
      const entries = parsed.feed?.entry;
      const itemCount = Array.isArray(entries) ? entries.length : entries ? 1 : 0;
      // Warn (but don't fail) if updated is older than 3 days
      let warning: string | undefined;
      const lastUpdated = parsed.feed?.updated;
      if (lastUpdated) {
        const age = Date.now() - Date.parse(lastUpdated);
        if (Number.isFinite(age) && age > 3 * 24 * 60 * 60 * 1000) {
          warning = `feed last updated ${(age / 86_400_000).toFixed(1)} days ago`;
        }
      }
      return {
        category: cat,
        url,
        http_status: res.status,
        parse_ok: true,
        item_count: itemCount,
        last_updated: lastUpdated,
        warning,
      };
    } catch (e) {
      return {
        category: cat,
        url,
        http_status: res.status,
        parse_ok: false,
        item_count: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } catch (e) {
    return {
      category: cat,
      url,
      http_status: "fetch_error",
      parse_ok: false,
      item_count: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const notify = url.searchParams.get("notify") === "1";

  const expected = process.env.REFRESH_SECRET;
  if (expected && notify) {
    const provided = req.headers.get("authorization") ?? url.searchParams.get("token");
    if (provided !== `Bearer ${expected}` && provided !== expected) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const probes = await Promise.all(FEEDS.map(probe));
  const broken = probes.filter((p) => !p.parse_ok || p.http_status !== 200);
  const warnings = probes.filter((p) => p.warning);
  const ok = broken.length === 0;

  let telegram: { ok: boolean; error?: string } | null = null;
  if (notify && !ok && isTelegramConfigured()) {
    const lines = ["<b>⚠ arXiv RSS health degraded</b>", ""];
    for (const b of broken) {
      lines.push(
        `• <code>${b.category}</code> — status ${b.http_status} parse=${b.parse_ok}${b.error ? ` (${b.error.slice(0, 80)})` : ""}`,
      );
    }
    for (const w of warnings) {
      lines.push(`• <code>${w.category}</code> — ${w.warning}`);
    }
    telegram = await sendTelegram(lines.join("\n"));
  }

  const status = ok ? 200 : 503;
  return NextResponse.json(
    {
      ok,
      checked_at: new Date().toISOString(),
      probes,
      broken: broken.length,
      warnings: warnings.length,
      telegram,
    },
    { status },
  );
}
