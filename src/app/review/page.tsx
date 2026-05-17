"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, FileSpreadsheet, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/Badge";
import { getIdentity } from "@/lib/identity";
import { categoryLabel } from "@/lib/utils";
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

export default function ReviewPage() {
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [me, setMe] = useState("anonymous");
  const [editors, setEditors] = useState<{ enforced: boolean; editors: string[] }>({
    enforced: false,
    editors: [],
  });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/corpus/custom?status=pending", { cache: "no-store" });
    setData(await r.json());
  }, []);

  useEffect(() => {
    setMe(getIdentity().alias);
    // Trigger rubric_client load so editors state is populated
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
    }
    await refresh();
  }

  return (
    <>
      <section className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6" aria-hidden /> Review queue
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Papers the daily arXiv cron has picked up but haven&apos;t been ranked
          yet. Approve to fold a paper into the public rankings; reject to
          keep it out of sight (the record stays so the cron won&apos;t
          re-ingest it). User-uploaded papers via{" "}
          <Link href="/upload" className="underline">/upload</Link> bypass the
          queue because the team explicitly imported them.
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
              Set your alias to one of these in the header.
            </span>
          </div>
        )}
        {error && (
          <p className="mt-3 text-sm text-rose-700 dark:text-rose-400">{error}</p>
        )}
      </section>

      {!data ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading review queue from Drive…
        </div>
      ) : data.records.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
          Queue is empty. New cron-picked papers will land here daily.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.records.map((r) => (
            <li
              key={r.paper.id}
              className="rounded-lg border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/paper/${encodeURIComponent(r.paper.id)}?include=pending`}
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
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => act(r.paper.id, "approve")}
                    disabled={isReadOnly || busy[r.paper.id]}
                    className="inline-flex items-center gap-1 rounded-md border bg-emerald-100 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
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
                    className="inline-flex items-center gap-1 rounded-md border bg-rose-100 px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-50 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-900"
                  >
                    {busy[r.paper.id] ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                    Reject
                  </button>
                </div>
              </div>
              {r.paper.abstract && (
                <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                  {r.paper.abstract}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={
        "rounded-lg border bg-card p-3 " +
        (highlight ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950" : "")
      }
    >
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
