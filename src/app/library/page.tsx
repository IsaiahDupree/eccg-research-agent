"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Download, FileSpreadsheet, FileText, Loader2, RefreshCw } from "lucide-react";
import { loadSeedPipelineClient } from "@/lib/seed_client";
import {
  useLibrary,
  clearLibraryCache,
  updateLibraryEntry,
  type ReadingStatus,
} from "@/lib/library_client";
import { useVotes } from "@/lib/votes_client";
import { PaperRow } from "@/components/PaperRow";
import { EmptyState } from "@/components/EmptyState";
import { LibraryEntryControls, ReadingStatusFilter } from "@/components/LibraryEntryControls";
import { PaperListSkeleton } from "@/components/Skeleton";
import { toBibtex } from "@/lib/bibtex";
import { categoryLabel, formatMonthsAgo } from "@/lib/utils";
import type { ScoredPaper } from "@/lib/models";

export default function LibraryPage() {
  const [scored, setScored] = useState<ScoredPaper[]>([]);
  const { items, loaded } = useLibrary();
  const { votes } = useVotes();

  useEffect(() => {
    setScored(loadSeedPipelineClient().scored);
  }, []);

  const byId = new Map(scored.map((s) => [s.paper.id, s]));
  const sortedItems = [...items].sort((a, b) => b.added_at.localeCompare(a.added_at));
  const allVisible = sortedItems
    .map((i) => ({ saved: i, paper: byId.get(i.paper_id) }))
    .filter((row): row is { saved: typeof items[number]; paper: ScoredPaper } => Boolean(row.paper));
  const missing = sortedItems.length - allVisible.length;

  // Status filter — initialise from ?status= URL param so links are shareable.
  const [statusFilter, setStatusFilter] = useState<ReadingStatus | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URL(window.location.href).searchParams;
    const s = params.get("status");
    if (s === "to_read" || s === "reading" || s === "read") setStatusFilter(s);
    const t = params.get("tag");
    if (t) setTagFilter(t);
  }, []);

  const statusCounts = useMemo(() => {
    const counts = { all: allVisible.length, to_read: 0, reading: 0, read: 0 };
    for (const r of allVisible) {
      const s = r.saved.reading_status;
      if (s === "to_read") counts.to_read++;
      else if (s === "reading") counts.reading++;
      else if (s === "read") counts.read++;
    }
    return counts;
  }, [allVisible]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allVisible) {
      for (const t of r.saved.tags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [allVisible]);

  const visible = useMemo(() => {
    return allVisible.filter((r) => {
      if (statusFilter !== "all" && r.saved.reading_status !== statusFilter) return false;
      if (tagFilter && !(r.saved.tags ?? []).includes(tagFilter)) return false;
      return true;
    });
  }, [allVisible, statusFilter, tagFilter]);

  function updateStatusFilter(next: ReadingStatus | "all") {
    setStatusFilter(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "all") url.searchParams.delete("status");
      else url.searchParams.set("status", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function updateTagFilter(next: string | null) {
    setTagFilter(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (!next) url.searchParams.delete("tag");
      else url.searchParams.set("tag", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function toggleSelected(paperId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(visible.map((r) => r.saved.paper_id)));
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkSetStatus(status: ReadingStatus) {
    if (selectedIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      // Sequential — there's a per-actor rate limit and Drive state needs
      // ordered writes anyway. With our small library sizes this is fine.
      for (const id of selectedIds) {
        await updateLibraryEntry(id, { reading_status: status });
      }
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  function exportBibtex() {
    const papers = visible.map(({ paper: s }) => s.paper);
    const header = `% ECCG team library — ${papers.length} papers, generated ${new Date().toISOString()}\n% https://eccg-research-agent.vercel.app/library\n\n`;
    const blob = new Blob([header + toBibtex(papers)], { type: "application/x-bibtex" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eccg-library-${new Date().toISOString().slice(0, 10)}.bib`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCsv() {
    // Defer to the server-side route so the CSV shape stays consistent
    // with curl users hitting /api/library/export?format=csv.
    window.location.href = "/api/library/export?format=csv";
  }

  function exportAnnotated() {
    // Server-side path so the .bib has the full notes state merged into
    // annote = {…} fields per paper.
    window.location.href = "/api/library/export?format=bibtex&include_notes=1";
  }

  async function exportMarkdown() {
    const lines: string[] = [];
    const date = new Date().toISOString().slice(0, 10);
    lines.push(`# ECCG Library — ${date}`);
    lines.push("");
    lines.push(`*Generated from the shared Drive library. ${visible.length} papers.*`);
    lines.push("");
    lines.push("---");
    lines.push("");
    // Fetch all notes for all library papers in parallel
    const noteResults = await Promise.all(
      visible.map(({ paper: s }) =>
        fetch(`/api/notes/${encodeURIComponent(s.paper.id)}`)
          .then((r) => (r.ok ? r.json() : { notes: [] }))
          .catch(() => ({ notes: [] })),
      ),
    );
    for (let i = 0; i < visible.length; i++) {
      const { paper: s, saved } = visible[i];
      const p = s.paper;
      const tally = votes[p.id];
      const myNotes = noteResults[i]?.notes ?? [];
      lines.push(`## ${i + 1}. ${p.title}`);
      lines.push("");
      lines.push(
        `**Authors:** ${p.authors.map((a) => a.name).join(", ")}`,
      );
      lines.push(
        `**Venue:** ${p.venue?.name ?? "arXiv preprint"} · ${formatMonthsAgo(p.months_since_publish)}`,
      );
      if (p.eccg_category) {
        lines.push(`**Category:** ${categoryLabel(p.eccg_category)}`);
      }
      lines.push(`**Rubric score:** ${s.total.toFixed(0)} / 100`);
      if (tally && (tally.up || tally.down)) {
        lines.push(
          `**Community vote:** ↑${tally.up} / ↓${tally.down} (net ${tally.net >= 0 ? "+" : ""}${tally.net})`,
        );
      }
      if (p.html_url) lines.push(`**Link:** [${p.html_url}](${p.html_url})`);
      lines.push(
        `**Saved by:** ${saved.added_by} on ${new Date(saved.added_at).toLocaleDateString()}`,
      );
      lines.push("");
      if (p.abstract) {
        lines.push("**Abstract.**");
        lines.push("");
        lines.push(p.abstract);
        lines.push("");
      }
      if (myNotes.length > 0) {
        lines.push("**Team notes:**");
        lines.push("");
        for (const n of myNotes) {
          lines.push(
            `- _${n.author}, ${new Date(n.created_at).toLocaleString()}:_ ${n.body.replace(/\n+/g, " ")}`,
          );
        }
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eccg-library-${date}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <section className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Team library</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Shared collection for the ECCG founding team. Persisted to the
              shared Drive folder so anyone with access sees the same set.
              Sign your saves with the alias in the header.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => clearLibraryCache()}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              title="Re-fetch from Drive"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              type="button"
              onClick={exportMarkdown}
              disabled={visible.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              title="Bundle papers + notes + vote tallies into a single shareable .md"
            >
              <FileText className="h-3.5 w-3.5" /> Export Markdown
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={visible.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              title="Spreadsheet-friendly: one row per paper"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
            </button>
            <button
              type="button"
              onClick={exportBibtex}
              disabled={visible.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> BibTeX
            </button>
            <button
              type="button"
              onClick={exportAnnotated}
              disabled={visible.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              title="BibTeX with team notes merged in as annote = {…}"
            >
              <Download className="h-3.5 w-3.5" /> Annotated
            </button>
          </div>
        </div>
        {missing > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {missing} item{missing === 1 ? "" : "s"} in the library aren&apos;t
            in the current corpus. They&apos;re hidden from this list but still
            recorded in Drive.
          </p>
        )}
      </section>
      {loaded && allVisible.length > 0 && selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-xs">
          <span className="font-medium">
            {selectedIds.size} selected
          </span>
          <span className="text-muted-foreground">— set status:</span>
          <button
            type="button"
            onClick={() => bulkSetStatus("to_read")}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
          >
            📚 To read
          </button>
          <button
            type="button"
            onClick={() => bulkSetStatus("reading")}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
          >
            👀 Reading
          </button>
          <button
            type="button"
            onClick={() => bulkSetStatus("read")}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
          >
            ✓ Read
          </button>
          {bulkBusy && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> applying…
            </span>
          )}
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkBusy}
            className="ml-auto rounded-md border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}
      {loaded && allVisible.length > 0 && (
        <div className="mb-3 space-y-2">
          <ReadingStatusFilter
            value={statusFilter}
            onChange={updateStatusFilter}
            counts={statusCounts}
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="mr-1 text-muted-foreground">Tags:</span>
              <button
                type="button"
                onClick={() => updateTagFilter(null)}
                aria-pressed={!tagFilter}
                className={`rounded-full border px-2.5 py-0.5 ${!tagFilter ? "border-accent bg-accent text-accent-foreground" : "hover:bg-muted"}`}
              >
                Any
              </button>
              {allTags.map(([t, count]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateTagFilter(t === tagFilter ? null : t)}
                  aria-pressed={tagFilter === t}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 ${
                    tagFilter === t ? "border-accent bg-accent text-accent-foreground" : "hover:bg-muted"
                  }`}
                >
                  {t}
                  <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div suppressHydrationWarning>
        {!loaded ? (
          <PaperListSkeleton rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title={
              statusFilter !== "all" || tagFilter
                ? `No library entries match the filter`
                : "Your team library is empty"
            }
            description={
              statusFilter !== "all" || tagFilter ? (
                "Clear filters to see your full library."
              ) : (
                <>
                  Tap{" "}
                  <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]">
                    <Bookmark className="h-3 w-3" /> Save
                  </span>{" "}
                  on any paper to add it here. Library entries persist to the
                  shared Drive folder so the whole team sees the same set.
                </>
              )
            }
            cta={
              statusFilter !== "all" || tagFilter
                ? {
                    onClick: () => {
                      updateStatusFilter("all");
                      updateTagFilter(null);
                    },
                    label: "Clear filters",
                  }
                : { href: "/", label: "Browse papers →" }
            }
          />
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={
                  selectedIds.size === visible.length ? clearSelection : selectAllVisible
                }
                className="rounded-md border px-2.5 py-1 hover:bg-muted"
              >
                {selectedIds.size === visible.length ? "Clear selection" : "Select all visible"}
              </button>
              {selectedIds.size > 0 && (
                <span className="text-muted-foreground">
                  {selectedIds.size} of {visible.length} selected
                </span>
              )}
            </div>
            <div className="rounded-lg border">
              {visible.map((row, i) => (
                <div
                  key={row.saved.paper_id}
                  className="grid grid-cols-[auto_1fr] gap-0"
                >
                  <label className="flex items-start pt-5 pl-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.saved.paper_id)}
                      onChange={() => toggleSelected(row.saved.paper_id)}
                      className="h-4 w-4 cursor-pointer accent-current"
                      aria-label={`Select ${row.paper.paper.title}`}
                    />
                  </label>
                  <div>
                    <PaperRow scored={row.paper} rank={i + 1} />
                    <LibraryEntryControls item={row.saved} />
                    <div className="ml-12 mb-3 text-[11px] text-muted-foreground">
                      Saved by <strong>{row.saved.added_by}</strong> ·{" "}
                      {new Date(row.saved.added_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
