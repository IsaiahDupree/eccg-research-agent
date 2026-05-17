/**
 * POST /api/ingest/spreadsheet
 *
 * Accepts multipart/form-data with field `file` (xlsx or csv).
 * Extracts arXiv ids from column A, batch-fetches metadata from arXiv,
 * filters by ECCG relevance, returns the new papers as JSON.
 *
 * V1 limitation: results are NOT persisted to the corpus — they're shown
 * to the user as a one-shot preview. Once persistence (Vercel KV or Drive
 * state JSON) is wired in V1.1, this same endpoint will gain a
 * `persist: true` option.
 */

import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { assignRelevance } from "@/lib/analysis/relevance";
import { CUSTOM_CORPUS_STATE } from "@/lib/custom_corpus";
import { readState, writeState } from "@/lib/google/state";
import type { Paper } from "@/lib/models";

interface UploadedRecord {
  paper: Paper;
  score_base: number;          // pre-similarity rubric estimate (0-100)
  uploaded_by: string;
  uploaded_at: string;
  source_file: string;
  status?: "pending" | "approved" | "rejected";
}

export const runtime = "nodejs";
export const maxDuration = 60;

const ARXIV_RE = /arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}|[a-z-]+\/[0-9]+)(?:v[0-9]+)?/i;
const ARXIV_BATCH = 100;
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const asArr = <T,>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function extractUrlsFromXlsx(arrayBuffer: ArrayBuffer): Promise<string[]> {
  // Dynamic import — xlsx is a heavy dep; keep it out of cold-start when not needed.
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: "",
  });
  const urls: string[] = [];
  for (const row of rows.slice(1)) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (typeof cell === "string" && cell.startsWith("http")) urls.push(cell);
    }
  }
  return urls;
}

function extractUrlsFromCsv(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,\t;]/))
    .map((c) => c.trim().replace(/^"|"$/g, ""))
    .filter((c) => c.startsWith("http"));
}

interface ArxivAtomEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  author: { name: string } | { name: string }[];
  category: { "@_term": string } | { "@_term": string }[];
  link:
    | { "@_href": string; "@_rel": string; "@_type"?: string }
    | { "@_href": string; "@_rel": string; "@_type"?: string }[];
}

function entryToPaper(e: ArxivAtomEntry): Paper {
  const idMatch = e.id.match(/abs\/([^v]+)(?:v\d+)?$/);
  const arxiv_id = idMatch ? idMatch[1] : e.id;
  const authors = asArr(e.author).map((a) => ({ name: a.name }));
  const categories = asArr(e.category).map((c) => c["@_term"]);
  const links = asArr(e.link);
  const pdf = links.find((l) => l["@_type"] === "application/pdf");
  const html = links.find((l) => l["@_rel"] === "alternate");
  const publishedAt = new Date(e.published);
  const months = Math.max(
    0,
    (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );
  return {
    id: `arxiv-${arxiv_id}`,
    arxiv_id,
    title: e.title.replace(/\s+/g, " ").trim(),
    abstract: e.summary.replace(/\s+/g, " ").trim(),
    authors,
    venue: { name: "arXiv preprint", type: "preprint" },
    published_at: publishedAt.toISOString(),
    categories,
    pdf_url: pdf?.["@_href"],
    html_url: html?.["@_href"],
    citation_count: 0,
    months_since_publish: months,
    citations_per_month: 0,
  };
}

async function fetchArxivBatch(idList: string[]): Promise<Paper[]> {
  const params = new URLSearchParams({
    id_list: idList.join(","),
    max_results: String(idList.length),
  });
  const url = `https://export.arxiv.org/api/query?${params}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "eccg-research-agent/1.0" },
  });
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  const text = await res.text();
  const parsed = xml.parse(text) as { feed?: { entry?: ArxivAtomEntry | ArxivAtomEntry[] } };
  return asArr(parsed.feed?.entry).map(entryToPaper);
}

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { ok: false, error: "expected multipart/form-data with 'file' field" },
      { status: 400 },
    );
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing 'file' field" }, { status: 400 });
  }
  const url = new URL(req.url);
  const persist = url.searchParams.get("persist") === "true" || form.get("persist") === "true";
  const uploader = String(form.get("uploader") ?? "anonymous").slice(0, 40);

  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  let urls: string[];
  try {
    if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
      urls = await extractUrlsFromXlsx(buf);
    } else if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
      urls = extractUrlsFromCsv(new TextDecoder().decode(buf));
    } else {
      return NextResponse.json(
        { ok: false, error: `unsupported file type: ${file.name}` },
        { status: 400 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  const arxivIds = new Set<string>();
  for (const u of urls) {
    const m = u.match(ARXIV_RE);
    if (m) arxivIds.add(m[1]);
  }
  // Cap batch size for serverless time budget
  const ids = Array.from(arxivIds).slice(0, 300);

  const papers: Paper[] = [];
  for (let i = 0; i < ids.length; i += ARXIV_BATCH) {
    const slice = ids.slice(i, i + ARXIV_BATCH);
    try {
      const batch = await fetchArxivBatch(slice);
      papers.push(...batch);
    } catch (err) {
      console.warn("arxiv batch failed:", err);
    }
    if (i + ARXIV_BATCH < ids.length) await sleep(3100);
  }
  assignRelevance(papers);

  // Top by ECCG relevance × recency (no citation data yet for fresh batches)
  const ranked = papers
    .map((p) => ({
      paper: p,
      score:
        (p.eccg_relevance ?? 0) * 6 +
        Math.exp(-p.months_since_publish / 12) * 4,
    }))
    .sort((a, b) => b.score - a.score);

  let persisted = 0;
  if (persist && papers.length > 0) {
    try {
      const existing = await readState<UploadedRecord[]>(CUSTOM_CORPUS_STATE, []);
      const known = new Set(existing.map((r) => r.paper.id));
      const additions: UploadedRecord[] = ranked
        .filter(({ paper }) => !known.has(paper.id))
        .map(({ paper, score }) => ({
          paper,
          // Scale rough rank score into the 0-100 range for display parity
          score_base: Math.min(100, score * 10),
          uploaded_by: uploader,
          uploaded_at: new Date().toISOString(),
          source_file: file.name,
          // User-uploaded papers default to approved — the team made an
          // explicit decision to import them.
          status: "approved",
        }));
      if (additions.length > 0) {
        await writeState(CUSTOM_CORPUS_STATE, [...additions, ...existing]);
        persisted = additions.length;
      }
    } catch (err) {
      console.error("[ingest:persist] failed:", err);
      return NextResponse.json(
        {
          ok: true,
          mode: "preview-only",
          persist_error: err instanceof Error ? err.message : String(err),
          urls_seen: urls.length,
          arxiv_ids_extracted: arxivIds.size,
          fetched: papers.length,
          truncated: ids.length < arxivIds.size,
          top: ranked.slice(0, 25).map((r) => ({
            id: r.paper.id,
            title: r.paper.title,
            authors: r.paper.authors.map((a) => a.name).slice(0, 3),
            eccg_category: r.paper.eccg_category,
            eccg_relevance: r.paper.eccg_relevance,
            arxiv_id: r.paper.arxiv_id,
            html_url: r.paper.html_url,
          })),
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    mode: persist ? "persisted" : "preview",
    urls_seen: urls.length,
    arxiv_ids_extracted: arxivIds.size,
    fetched: papers.length,
    persisted_to_corpus: persisted,
    truncated: ids.length < arxivIds.size,
    top: ranked.slice(0, 25).map((r) => ({
      id: r.paper.id,
      title: r.paper.title,
      authors: r.paper.authors.map((a) => a.name).slice(0, 3),
      eccg_category: r.paper.eccg_category,
      eccg_relevance: r.paper.eccg_relevance,
      arxiv_id: r.paper.arxiv_id,
      html_url: r.paper.html_url,
    })),
  });
}
