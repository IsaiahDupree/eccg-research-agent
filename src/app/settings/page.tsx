"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, RotateCcw, Save, Sliders } from "lucide-react";
import {
  DEFAULT_WEIGHTS,
  getEditorsState,
  type RubricWeightOverrides,
  saveRubricWeights,
  useRubricWeights,
} from "@/lib/rubric_client";
import { getIdentity } from "@/lib/identity";
import { cn } from "@/lib/utils";
import { DEFAULT_RUBRIC } from "@/lib/scoring/weights";

const ORDER: (keyof RubricWeightOverrides)[] = [
  "eccg_relevance",
  "citation_velocity",
  "citation_graph",
  "community_score",
  "code_availability",
  "novelty",
  "venue_prestige",
  "author_signal",
  "recency",
];

export default function SettingsPage() {
  const { weights: loaded, loaded: ready } = useRubricWeights();
  const [draft, setDraft] = useState<RubricWeightOverrides>(loaded);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string>("anonymous");
  const [editors, setEditors] = useState<{ enforced: boolean; editors: string[] }>({
    enforced: false,
    editors: [],
  });

  useEffect(() => {
    setDraft({ ...loaded });
    setMe(getIdentity().alias);
    setEditors(getEditorsState());
  }, [loaded, ready]);

  const total = Object.values(draft).reduce((s, v) => s + v, 0);
  const desc = Object.fromEntries(
    DEFAULT_RUBRIC.categories.map((c) => [c.name, c.description]),
  ) as Record<keyof RubricWeightOverrides, string>;
  const dirty = ORDER.some((k) => draft[k] !== loaded[k]);

  const isReadOnly =
    editors.enforced && !editors.editors.some((e) => e.toLowerCase() === me.toLowerCase());

  async function commit() {
    setBusy(true);
    setError(null);
    const result = await saveRubricWeights({ ...draft }, me);
    setBusy(false);
    if (result.ok) {
      setSavedAt(new Date().toLocaleTimeString());
      window.dispatchEvent(new Event("storage"));
    } else {
      setError(result.error ?? "save failed");
    }
  }

  function reset() {
    setDraft({ ...DEFAULT_WEIGHTS });
  }

  return (
    <>
      <section className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sliders className="h-5 w-5" aria-hidden /> Ranking settings
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Per-team rubric weights. Each slider sets how much that axis
          contributes to the composite score on <code>/</code>. Saved to the
          shared Drive state — your team sees the same weights you set here.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
          Identity: <strong>{typeof window !== "undefined" ? getIdentity().alias : "—"}</strong>{" "}
          · Sum of weights: <strong className="tabular-nums">{total}</strong>{" "}
          {total !== 100 && total > 0 && (
            <em>(non-100 totals are fine — scores are re-normalised to 0–100)</em>
          )}
        </p>
      </section>

      {ready && isReadOnly && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Read-only — only editors{" "}
            <strong>{editors.editors.join(", ")}</strong> can save. Set your
            alias to one of these in the header, or update the{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">
              EDITORS
            </code>{" "}
            env var to extend access.
          </span>
        </div>
      )}

      {!ready ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading current weights from Drive…
        </div>
      ) : (
        <div className="space-y-3">
          {ORDER.map((name) => (
            <Slider
              key={name}
              name={name}
              value={draft[name]}
              defaultValue={DEFAULT_WEIGHTS[name]}
              description={desc[name]}
              onChange={(v) => setDraft((d) => ({ ...d, [name]: v }))}
            />
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        {savedAt && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            saved at {savedAt}
          </span>
        )}
        {error && (
          <span className="text-xs text-rose-700 dark:text-rose-400">{error}</span>
        )}
        <button
          type="button"
          onClick={reset}
          disabled={!dirty && JSON.stringify(draft) === JSON.stringify(DEFAULT_WEIGHTS)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          title="Reset to default weights"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={!dirty || busy || isReadOnly}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/90",
            (!dirty || busy) && "opacity-50",
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save to team
        </button>
      </div>
    </>
  );
}

function Slider({
  name,
  value,
  defaultValue,
  description,
  onChange,
}: {
  name: string;
  value: number;
  defaultValue: number;
  description: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-sm font-medium" htmlFor={`slider-${name}`}>
          {name.replace(/_/g, " ")}
        </label>
        <div className="flex items-center gap-2 text-xs">
          <span className="tabular-nums">
            {value} <span className="text-muted-foreground">/ default {defaultValue}</span>
          </span>
          <input
            id={`slider-${name}`}
            type="number"
            min={0}
            max={50}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-14 rounded border bg-background px-1 py-0.5 text-right tabular-nums"
          />
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={50}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-current"
        aria-label={`${name} weight`}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
