"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Save, Upload } from "lucide-react";
import { Badge } from "@/components/Badge";
import { cn, categoryLabel } from "@/lib/utils";
import { getIdentity } from "@/lib/identity";
import { clearCustomCorpusCache } from "@/lib/custom_corpus_client";

interface PreviewItem {
  id: string;
  title: string;
  authors: string[];
  eccg_category?: string;
  eccg_relevance?: number;
  arxiv_id?: string;
  html_url?: string;
}

interface PreviewResponse {
  ok: boolean;
  mode?: string;
  urls_seen?: number;
  arxiv_ids_extracted?: number;
  fetched?: number;
  persisted_to_corpus?: number;
  persist_error?: string;
  truncated?: boolean;
  top?: PreviewItem[];
  error?: string;
}

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [persistBusy, setPersistBusy] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [result, setResult] = useState<PreviewResponse | null>(null);

  const run = useCallback(async (file: File, persist: boolean) => {
    const which = persist ? setPersistBusy : setBusy;
    which(true);
    if (!persist) setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (persist) {
        form.append("persist", "true");
        form.append("uploader", getIdentity().alias);
      }
      const res = await fetch(
        `/api/ingest/spreadsheet${persist ? "?persist=true" : ""}`,
        { method: "POST", body: form },
      );
      const json: PreviewResponse = await res.json();
      setResult(json);
      if (persist) clearCustomCorpusCache();
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      which(false);
    }
  }, []);

  const onFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || !files.length) return;
      const file = "item" in files ? files.item(0) : files[0];
      if (!file) return;
      setLastFile(file);
      await run(file, false);
    },
    [run],
  );

  const onPersist = useCallback(async () => {
    if (!lastFile) return;
    await run(lastFile, true);
  }, [lastFile, run]);

  return (
    <>
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Upload a spreadsheet</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Drop an XLSX or CSV with URLs in any column. The pipeline extracts
          arXiv ids, fetches metadata in batches, scores by ECCG relevance,
          and shows the top hits. Hit <em>Save to corpus</em> after the preview
          to persist the new papers into the shared Drive corpus — they&apos;ll
          show up on <code>/</code> for everyone on the team.
        </p>
      </section>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted/30 transition-colors",
          dragging && "border-accent bg-accent/10",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xlsm,.csv,.tsv,.txt"
          onChange={(e) => onFiles(e.target.files)}
        />
        {busy ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm">Processing — batching arXiv calls (max ~30s)…</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm">
              Drop an XLSX/CSV here, or <span className="text-accent underline">click to browse</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              First 300 unique arXiv ids will be ingested (Vercel function budget).
            </p>
          </>
        )}
      </div>

      {result && !result.ok && (
        <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {result.error ?? "Upload failed."}
        </div>
      )}

      {result && result.ok && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">{result.fetched} papers ingested</span>
            <span className="text-muted-foreground">
              · {result.urls_seen?.toLocaleString()} URLs scanned
            </span>
            <span className="text-muted-foreground">
              · {result.arxiv_ids_extracted?.toLocaleString()} arXiv ids extracted
            </span>
            {result.truncated && (
              <Badge variant="muted">capped at 300 — re-upload to ingest the rest</Badge>
            )}
          </div>

          {typeof result.persisted_to_corpus === "number" && result.persisted_to_corpus > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {result.persisted_to_corpus} new paper{result.persisted_to_corpus === 1 ? "" : "s"} written to the shared corpus.
              <Link href="/" className="underline">Browse</Link>
            </div>
          )}
          {result.persist_error && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              Persist failed: {result.persist_error}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Preview
            </h2>
            <button
              type="button"
              onClick={onPersist}
              disabled={persistBusy || !lastFile || result.mode === "persisted"}
              className="inline-flex items-center gap-1.5 rounded-md border bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
              title="Persist to the shared corpus (Drive state)"
            >
              {persistBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {result.mode === "persisted" ? "Saved to corpus" : "Save to corpus"}
            </button>
          </div>

          <ul className="mt-2 divide-y rounded-lg border">
            {result.top?.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <Link
                    href={`/paper/${encodeURIComponent(p.id)}`}
                    className="line-clamp-2 font-medium hover:underline"
                  >
                    {p.title}
                  </Link>
                  <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {p.authors.join(", ")}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  {p.eccg_category && (
                    <Badge variant="outline">{categoryLabel(p.eccg_category)}</Badge>
                  )}
                  {typeof p.eccg_relevance === "number" && (
                    <div className="mt-1 tabular-nums">
                      relevance {(p.eccg_relevance * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
