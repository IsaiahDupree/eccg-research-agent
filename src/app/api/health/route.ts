/**
 * GET /api/health
 *
 * Pings every external dependency with a tight timeout and reports
 * per-service status: ok | degraded | unreachable | not_configured.
 *
 * Used for:
 *   - cron preflight (decide whether to skip the refresh run)
 *   - uptime monitoring (Uptime Kuma / curl from CI)
 *   - quick "is anything wrong" dashboard at /about
 *
 * No external auth needed — the response only exposes high-level
 * reachability, never credentials or per-request data.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOFT_TIMEOUT_MS = 3000;

type Status = "ok" | "degraded" | "unreachable" | "not_configured";

interface Check {
  name: string;
  status: Status;
  latency_ms?: number;
  note?: string;
}

async function ping(
  name: string,
  fn: () => Promise<Response>,
  notConfigured?: boolean,
): Promise<Check> {
  if (notConfigured) return { name, status: "not_configured" };
  const started = performance.now();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), SOFT_TIMEOUT_MS);
  try {
    const res = await fn();
    const latency_ms = Math.round(performance.now() - started);
    if (res.ok) return { name, status: "ok", latency_ms };
    if (res.status === 401 || res.status === 403) {
      // Reachable but auth issue — that's still "ok" for an unauthenticated
      // health ping. We're just checking the host responds.
      return { name, status: "ok", latency_ms, note: `auth ${res.status}` };
    }
    if (res.status >= 500) {
      return { name, status: "degraded", latency_ms, note: `http ${res.status}` };
    }
    return { name, status: "ok", latency_ms, note: `http ${res.status}` };
  } catch (err) {
    return {
      name,
      status: "unreachable",
      latency_ms: Math.round(performance.now() - started),
      note: err instanceof Error ? err.name : "error",
    };
  } finally {
    clearTimeout(tid);
  }
}

async function pingArxiv(): Promise<Check> {
  return ping("arxiv", () =>
    fetch("https://export.arxiv.org/api/query?search_query=cat:cs.CV&max_results=1", {
      headers: { "User-Agent": "eccg-research-agent/health" },
    }),
  );
}

async function pingS2(): Promise<Check> {
  return ping("semantic_scholar", () =>
    fetch(
      "https://api.semanticscholar.org/graph/v1/paper/search?query=event+camera&limit=1",
      { headers: { Accept: "application/json" } },
    ),
  );
}

async function pingOpenAi(): Promise<Check> {
  const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
  return ping(
    "openai",
    () =>
      fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY?.trim() ?? ""}`,
        },
      }),
    !configured,
  );
}

async function pingAnthropic(): Promise<Check> {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  return ping(
    "anthropic",
    () =>
      // Anthropic doesn't have a public ping endpoint; HEAD on the messages
      // host gives a 405 (reachable) or network error (unreachable).
      fetch("https://api.anthropic.com/v1/messages", { method: "OPTIONS" }),
    !configured,
  );
}

async function pingDrive(): Promise<Check> {
  const configured = Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim(),
  );
  if (!configured) return { name: "drive", status: "not_configured" };
  const started = performance.now();
  try {
    const { readState } = await import("@/lib/google/state");
    await readState<unknown>("library", []);
    return {
      name: "drive",
      status: "ok",
      latency_ms: Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      name: "drive",
      status: "unreachable",
      latency_ms: Math.round(performance.now() - started),
      note: err instanceof Error ? err.message.slice(0, 80) : "error",
    };
  }
}

function checkTelegram(): Check {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_CHAT_ID?.trim()) {
    return { name: "telegram", status: "not_configured" };
  }
  return { name: "telegram", status: "ok", note: "credentials present" };
}

function checkSlack(): Check {
  if (!process.env.SLACK_WEBHOOK_URL?.trim()) {
    return { name: "slack", status: "not_configured" };
  }
  return { name: "slack", status: "ok", note: "webhook url present" };
}

export async function GET() {
  const started = performance.now();
  const checks = await Promise.all([
    pingArxiv(),
    pingS2(),
    pingOpenAi(),
    pingAnthropic(),
    pingDrive(),
    Promise.resolve(checkTelegram()),
    Promise.resolve(checkSlack()),
  ]);
  const runtime_ms = Math.round(performance.now() - started);

  // Aggregate: ok unless any required dependency is degraded/unreachable.
  // arXiv + S2 are read-only and have local fallbacks; OpenAI/Anthropic
  // missing only blocks the LLM digest path; Drive missing blocks state
  // writes. We surface the worst per-service status.
  const overall = checks.some((c) => c.status === "unreachable")
    ? "degraded"
    : checks.some((c) => c.status === "degraded")
      ? "degraded"
      : "ok";

  return NextResponse.json(
    {
      ok: overall === "ok",
      overall,
      runtime_ms,
      checked_at: new Date().toISOString(),
      services: checks,
    },
    {
      status: overall === "ok" ? 200 : 207,
      headers: { "cache-control": "no-store" },
    },
  );
}
