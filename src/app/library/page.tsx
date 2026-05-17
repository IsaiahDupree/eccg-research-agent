"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Download, FileText, RefreshCw } from "lucide-react";
import { loadSeedPipelineClient } from "@/lib/seed_client";
import { useLibrary, clearLibraryCache } from "@/lib/library_client";
import { useVotes } from "@/lib/votes_client";
import { PaperRow } from "@/components/PaperRow";
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
  const visible = sortedItems
    .map((i) => ({ saved: i, paper: byId.get(i.paper_id) }))
    .filter((row): row is { saved: typeof items[number]; paper: ScoredPaper } => Boolean(row.paper));
  const missing = sortedItems.length - visible.length;

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
              onClick={exportBibtex}
              disabled={visible.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> Export BibTeX
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
      <div className="rounded-lg border" suppressHydrationWarning>
        {!loaded ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading from shared Drive…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <Bookmark className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm">
              Team library is empty. Tap{" "}
              <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs">
                <Bookmark className="h-3 w-3" /> Save
              </span>{" "}
              on any paper to add it.
            </p>
            <Link
              href="/"
              className="mt-4 text-sm text-accent underline-offset-4 hover:underline"
            >
              Browse papers →
            </Link>
          </div>
        ) : (
          visible.map((row, i) => (
            <div key={row.saved.paper_id}>
              <PaperRow scored={row.paper} rank={i + 1} />
              <div className="-mt-2 ml-12 mb-3 text-[11px] text-muted-foreground">
                Saved by <strong>{row.saved.added_by}</strong> ·{" "}
                {new Date(row.saved.added_at).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
