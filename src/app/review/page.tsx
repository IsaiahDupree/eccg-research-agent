"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  History,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { InlineLoader } from "@/components/Skeleton";
import { getIdentity } from "@/lib/identity";
import { NICHES } from "@/lib/niches";
import { categoryLabel, cn } from "@/lib/utils";
import { getEditorsState } from "@/lib/rubric_client";

interface UploadedRecord {
  paper: {
    id: string;
    title: string;
    abstract?: string;
    authors: { name: string }[];
    venue?: { name?: string };
    eccg_category?: string;
    published_at?: string;
    arxiv_id?: string;
    html_url?: string;
  };
  score_base: number;
  uploaded_by: string;
  uploaded_at: string;
  source_file: string;
  status?: "pending" | "approved" | "rejected";
}

interface ReviewResponse {
  count: number;
  total: number;
  counts: { approved: number; pending: number; rejected: number };
  records: UploadedRecord[];
}

interface AuditEntry {
  at: string;
  actor: string;
  action: "approve" | "reject";
  paper_ids: string[];
  category?: string;
  niche?: string;
  note?: string;
  source: "single" | "bulk_ids" | "bulk_category";
}

function nicheOfRecord(r: UploadedRecord): string {
  // uploaded_by="cron:<niche>" for cron-discovered papers; spreadsheet/user
  // uploads default to event_camera (the founding niche).
  return r.uploaded_by.startsWith("cron:") ? r.uploaded_by.slice(5) : "event_camera";
}

export default function ReviewPage() {
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [digests, setDigests] = useState<Record<string, { tldr: string; model: string } | "loading" | "error">>({});
  const [me, setMe] = useState("anonymous");
  const [editors, setEditors] = useState<{ enforced: boolean; editors: string[] }>({
    enforced: false,
    editors: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [nicheFilter, setNicheFilter] = useState<string>("all");
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const refresh = useCallback(async () => {
    const [recordsR, auditR] = await Promise.all([
      fetch("/api/corpus/custom?status=pending", { cache: "no-store" }),
      fetch("/api/review/audit?limit=20", { cache: "no-store" }),
    ]);
    setData(await recordsR.json());
    const a = await auditR.json();
    setAudit(Array.isArray(a.entries) ? a.entries : []);
  }, []);

  useEffect(() => {
    setMe(getIdentity().alias);
    if (typeof window !== "undefined") {
      const q = new URL(window.location.href).searchParams.get("niche");
      if (q) setNicheFilter(q);
    }
    fetch("/api/rubric")
      .then((r) => r.json())
      .then((j) => {
        setEditors({
          enforced: Boolean(j.editors_enforced),
          editors: Array.isArray(j.editors) ? j.editors : [],
        });
      })
      .catch(() => setEditors(getEditorsState()));
    refresh();
  }, [refresh]);

  const isReadOnly =
    editors.enforced && !editors.editors.some((e) => e.toLowerCase() === me.toLowerCase());

  const filteredRecords = useMemo(() => {
    const recs = data?.records ?? [];
    if (nicheFilter === "all") return recs;
    return recs.filter((r) => nicheOfRecord(r) === nicheFilter);
  }, [data, nicheFilter]);

  const nicheCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of data?.records ?? []) {
      const tag = nicheOfRecord(r);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  // Group records by ECCG category for the "approve all in <category>" UI.
  const byCategory = useMemo(() => {
    const m = new Map<string, UploadedRecord[]>();
    for (const r of filteredRecords) {
      const cat = r.paper.eccg_category ?? "unclassified";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredRecords]);

  function setNicheFilterAndUrl(slug: string) {
    setNicheFilter(slug);
    setSelected(new Set());
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (slug === "all") url.searchParams.delete("niche");
      else url.searchParams.set("niche", slug);
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function act(paper_id: string, action: "approve" | "reject") {
    if (isReadOnly) {
      setError("Read-only — your alias is not on the editor allowlist.");
      return;
    }
    setError(null);
    setBusy((b) => ({ ...b, [paper_id]: true }));
    try {
      const r = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paper_id, action, user: me }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${r.status}`);
      }
    } finally {
      setBusy((b) => ({ ...b, [paper_id]: false }));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(paper_id);
        return n;
      });
    }
    await refresh();
  }

  async function bulkAct(action: "approve" | "reject", body: object, ctx: string) {
    if (isReadOnly) {
      setError("Read-only — your alias is not on the editor allowlist.");
      return;
    }
    setError(null);
    setBulkBusy(true);
    try {
      const r = await fetch("/api/review/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, action, user: me }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? `${ctx} failed (HTTP ${r.status})`);
      } else {
        setSelected(new Set());
      }
    } finally {
      setBulkBusy(false);
    }
    await refresh();
  }

  async function loadDigest(paperId: string) {
    if (digests[paperId]) return;
    setDigests((d) => ({ ...d, [paperId]: "loading" }));
    try {
      const r = await fetch(`/api/digest/${encodeURIComponent(paperId)}`);
      const j = await r.json();
      if (j.digest) {
        setDigests((d) => ({
          ...d,
          [paperId]: { tldr: j.digest.tldr ?? "", model: j.digest.model ?? "" },
        }));
      } else {
        setDigests((d) => ({ ...d, [paperId]: "error" }));
      }
    } catch {
      setDigests((d) => ({ ...d, [paperId]: "error" }));
    }
  }

  function toggleExpanded(paperId: string) {
    setExpanded((e) => {
      const n = new Set(e);
      if (n.has(paperId)) n.delete(paperId);
      else {
        n.add(paperId);
        loadDigest(paperId);
      }
      return n;
    });
  }

  function toggleSelected(paperId: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(paperId)) n.delete(paperId);
      else n.add(paperId);
      return n;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(filteredRecords.map((r) => r.paper.id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  return (
    <>
      <section className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6" aria-hidden /> Review queue
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Papers the daily arXiv cron picked up but haven&apos;t been ranked yet.
          Use the per-row buttons, or batch-approve everything in a category
          with one click. User-uploaded papers via{" "}
          <Link href="/upload" className="underline">/upload</Link> bypass the
          queue.
        </p>
        {data?.counts && (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Pending" value={data.counts.pending} highlight={data.counts.pending > 0} />
            <Stat label="Approved (lifetime)" value={data.counts.approved} />
            <Stat label="Rejected (lifetime)" value={data.counts.rejected} />
          </dl>
        )}
        {isReadOnly && (
          <div className="mt-3 inline-flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Read-only — only editors{" "}
              <strong>{editors.editors.join(", ")}</strong> can approve or reject.
            </span>
          </div>
        )}
        {error && (
          <p className="mt-3 text-sm text-rose-700 dark:text-rose-400">{error}</p>
        )}
      </section>

      {data && data.records.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1 text-muted-foreground">Niche:</span>
          {[
            { slug: "all", label: "All", count: data.records.length },
            ...NICHES.map((n) => ({
              slug: n.slug,
              label: n.label,
              count: nicheCounts.get(n.slug) ?? 0,
            })),
          ].map(({ slug, label, count }) => (
            <button
              key={slug}
              type="button"
              onClick={() => setNicheFilterAndUrl(slug)}
              aria-pressed={nicheFilter === slug}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5",
                nicheFilter === slug
                  ? "border-accent bg-accent text-accent-foreground"
                  : "hover:bg-muted",
                slug !== "all" && count === 0 && "opacity-40",
              )}
            >
              {label}
              <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <InlineLoader>Loading review queue from Drive…</InlineLoader>
      ) : filteredRecords.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={
            nicheFilter === "all"
              ? "Queue is empty"
              : `No pending papers in ${nicheFilter}`
          }
          description={
            nicheFilter === "all"
              ? "New cron-picked papers will land here daily at 06:00 UTC. Approved papers move into the main rankings; rejected ones stay hidden in Drive state so they don't get re-ingested."
              : "Clear the niche filter to see the full queue, or check back tomorrow."
          }
          cta={
            nicheFilter !== "all"
              ? { onClick: () => setNicheFilterAndUrl("all"), label: "Show all niches" }
              : undefined
          }
        />
      ) : (
        <>
          {/* Per-category quick actions */}
          {byCategory.length > 1 && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-3">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Approve all in a category
              </h3>
              <div className="flex flex-wrap gap-2">
                {byCategory.map(([cat, items]) => (
                  <button
                    key={cat}
                    type="button"
                    disabled={isReadOnly || bulkBusy}
                    onClick={() =>
                      bulkAct("approve", { category: cat, status_in: "pending" }, `approve ${cat}`)
                    }
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    <Check className="h-3 w-3 text-emerald-600" />
                    {categoryLabel(cat)}{" "}
                    <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {items.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selection bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={selected.size === filteredRecords.length ? clearSelection : selectAllVisible}
              className="rounded-md border px-2.5 py-1 hover:bg-muted"
            >
              {selected.size === filteredRecords.length ? "Clear selection" : "Select all visible"}
            </button>
            <span className="text-muted-foreground">
              {selected.size} of {filteredRecords.length} selected
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  bulkAct("approve", { paper_ids: Array.from(selected) }, "bulk approve")
                }
                disabled={selected.size === 0 || isReadOnly || bulkBusy}
                className="inline-flex items-center gap-1 rounded-md border bg-emerald-100 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-950 dark:text-emerald-300"
              >
                {bulkBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Approve selected
              </button>
              <button
                type="button"
                onClick={() =>
                  bulkAct("reject", { paper_ids: Array.from(selected) }, "bulk reject")
                }
                disabled={selected.size === 0 || isReadOnly || bulkBusy}
                className="inline-flex items-center gap-1 rounded-md border bg-rose-100 px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-50 dark:bg-rose-950 dark:text-rose-300"
              >
                <X className="h-3.5 w-3.5" />
                Reject selected
              </button>
            </span>
          </div>

          {audit.length > 0 && (
            <div className="mb-4 rounded-lg border bg-card p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <History className="h-3 w-3" /> Recent decisions
              </h3>
              <ul className="space-y-1.5 text-xs">
                {audit.slice(0, 8).map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        e.action === "approve"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
                      )}
                    >
                      {e.action === "approve" ? (
                        <Check className="h-2.5 w-2.5" />
                      ) : (
                        <X className="h-2.5 w-2.5" />
                      )}
                      {e.action}
                    </span>
                    <span className="font-medium">{e.actor}</span>
                    <span className="text-muted-foreground">
                      {e.source === "bulk_category"
                        ? `all ${e.paper_ids.length} in ${e.category ?? "?"}`
                        : e.source === "bulk_ids"
                          ? `${e.paper_ids.length} papers`
                          : "1 paper"}
                    </span>
                    {e.note && (
                      <span className="text-muted-foreground italic">
                        “{e.note.length > 60 ? `${e.note.slice(0, 60)}…` : e.note}”
                      </span>
                    )}
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {new Date(e.at).toLocaleString()}
                    </span>
                  </li>
                ))}
                {audit.length > 8 && (
                  <li className="text-muted-foreground">
                    +{audit.length - 8} earlier decisions
                  </li>
                )}
              </ul>
            </div>
          )}

          <ul className="space-y-3">
            {filteredRecords.map((r) => {
              const isExpanded = expanded.has(r.paper.id);
              const dig = digests[r.paper.id];
              return (
                <li key={r.paper.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.paper.id)}
                        onChange={() => toggleSelected(r.paper.id)}
                        className="mt-1.5 h-4 w-4 cursor-pointer accent-current"
                        aria-label={`Select ${r.paper.title}`}
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/paper/${encodeURIComponent(r.paper.id)}`}
                          className="line-clamp-2 text-base font-medium hover:underline"
                        >
                          {r.paper.title}
                        </Link>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {r.paper.authors.slice(0, 3).map((a) => a.name).join(", ")}
                          {r.paper.authors.length > 3 && ` +${r.paper.authors.length - 3}`}
                          {" · "}
                          {r.paper.venue?.name ?? "preprint"}
                          {" · ingested "}
                          {new Date(r.uploaded_at).toLocaleDateString()} by{" "}
                          <strong>{r.uploaded_by}</strong>
                          {" · "}
                          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                            <FileSpreadsheet className="h-3 w-3" /> {r.source_file}
                          </span>
                        </div>
                        {r.paper.eccg_category && (
                          <Badge variant="outline" className="mt-2">
                            {categoryLabel(r.paper.eccg_category)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(r.paper.id)}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 hover:bg-muted"
                        title="Generate / show LLM TL;DR"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <Sparkles className="h-3 w-3" /> Quick read
                      </button>
                      <button
                        type="button"
                        onClick={() => act(r.paper.id, "approve")}
                        disabled={isReadOnly || busy[r.paper.id]}
                        className="inline-flex items-center gap-1 rounded-md border bg-emerald-100 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-950 dark:text-emerald-300"
                      >
                        {busy[r.paper.id] ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => act(r.paper.id, "reject")}
                        disabled={isReadOnly || busy[r.paper.id]}
                        className="inline-flex items-center gap-1 rounded-md border bg-rose-100 px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-50 dark:bg-rose-950 dark:text-rose-300"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                      {dig === "loading" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> generating LLM TL;DR…
                        </span>
                      ) : dig === "error" || !dig ? (
                        <span className="text-xs text-muted-foreground">
                          {dig === "error" ? "Couldn't fetch digest. " : ""}Falling back to abstract:
                          <span className="mt-1 block text-sm text-foreground">
                            {r.paper.abstract ?? "(no abstract)"}
                          </span>
                        </span>
                      ) : (
                        <>
                          <p className="text-foreground">{dig.tldr}</p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            via{" "}
                            <code className="rounded bg-background px-1">{dig.model}</code>
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  {!isExpanded && r.paper.abstract && (
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {r.paper.abstract}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        highlight && "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
      )}
    >
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
