"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Download, Loader2 } from "lucide-react";
import { getIdentity } from "@/lib/identity";

interface Props {
  arxivId: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; paperId: string; alreadyPresent: boolean; category?: string }
  | { kind: "error"; message: string };

export default function IngestButton({ arxivId }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [alias, setAlias] = useState("anonymous");

  useEffect(() => {
    setAlias(getIdentity().alias);
  }, []);

  async function ingest() {
    setState({ kind: "loading" });
    try {
      const r = await fetch("/api/ingest/by-arxiv-id", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ arxiv_id: arxivId, user: alias }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setState({ kind: "error", message: j.error ?? `HTTP ${r.status}` });
        return;
      }
      setState({
        kind: "ok",
        paperId: j.paper.id,
        alreadyPresent: Boolean(j.already_present),
        category: j.paper.eccg_category,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (state.kind === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        <Check className="h-3 w-3" />
        {state.alreadyPresent ? "already in corpus · " : "ingested · "}
        <Link href={`/paper/${encodeURIComponent(state.paperId)}`} className="underline">
          open
        </Link>
        {state.category && (
          <span className="text-[10px] opacity-75">({state.category})</span>
        )}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={ingest}
        disabled={state.kind === "loading"}
        className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 hover:bg-muted disabled:opacity-50"
        title="Pull this paper into the corpus"
      >
        {state.kind === "loading" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        Ingest
      </button>
      {state.kind === "error" && (
        <span
          className="text-[10px] text-rose-700 dark:text-rose-400"
          title={state.message}
        >
          {state.message.length > 32
            ? `${state.message.slice(0, 32)}…`
            : state.message}
        </span>
      )}
    </>
  );
}
