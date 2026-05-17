"use client";

import { useState } from "react";
import { BookOpen, Check, Loader2, Plus, Tag, X as XIcon } from "lucide-react";
import {
  updateLibraryEntry,
  type LibraryItem,
  type ReadingStatus,
} from "@/lib/library_client";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<ReadingStatus, string> = {
  to_read: "To read",
  reading: "Reading",
  read: "Read",
};

const STATUS_ORDER: ReadingStatus[] = ["to_read", "reading", "read"];

interface Props {
  item: LibraryItem;
}

/**
 * Inline editor sitting next to each library row. Tag chips (8 max),
 * a reading-status cycler, and an inline tag-add input. Persists via
 * /api/library?action=update. Optimistic — failure surfaces in console.
 */
export function LibraryEntryControls({ item }: Props) {
  const [busy, setBusy] = useState(false);
  const [newTag, setNewTag] = useState("");
  const tags = item.tags ?? [];
  const status = item.reading_status;

  async function setStatus(next: ReadingStatus) {
    setBusy(true);
    try {
      await updateLibraryEntry(item.paper_id, { reading_status: next });
    } finally {
      setBusy(false);
    }
  }

  async function addTag(raw: string) {
    const t = raw.trim().toLowerCase().slice(0, 32);
    if (!t || tags.includes(t) || tags.length >= 8) return;
    setBusy(true);
    try {
      await updateLibraryEntry(item.paper_id, { tags: [...tags, t] });
      setNewTag("");
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(t: string) {
    setBusy(true);
    try {
      await updateLibraryEntry(item.paper_id, { tags: tags.filter((x) => x !== t) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ml-12 mb-3 flex flex-wrap items-center gap-2 text-[11px]">
      {/* Reading status cycler */}
      <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Reading status">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            disabled={busy}
            aria-pressed={status === s}
            className={cn(
              "px-2 py-0.5 text-[10px] transition-colors",
              status === s
                ? "bg-accent text-accent-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {s === "to_read" && "📚 "}
            {s === "reading" && "👀 "}
            {s === "read" && "✓ "}
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Tag chips */}
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Tag className="h-3 w-3" aria-hidden />
      </span>
      {tags.length === 0 && (
        <span className="text-muted-foreground italic">no tags</span>
      )}
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-0.5 rounded-full border bg-muted px-2 py-0.5"
        >
          {t}
          <button
            type="button"
            onClick={() => removeTag(t)}
            disabled={busy}
            aria-label={`Remove tag ${t}`}
            className="rounded-full p-0.5 hover:bg-background"
          >
            <XIcon className="h-2.5 w-2.5" aria-hidden />
          </button>
        </span>
      ))}

      {/* Add-tag input — capped at 8 tags total */}
      {tags.length < 8 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTag(newTag);
          }}
          className="inline-flex items-center gap-1"
        >
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="add tag"
            maxLength={32}
            className="w-20 rounded border bg-background px-1.5 py-0.5 text-[10px] outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || !newTag.trim()}
            aria-label="Add tag"
            className="rounded border bg-background p-0.5 hover:bg-muted disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Plus className="h-2.5 w-2.5" />
            )}
          </button>
        </form>
      )}
      {item.status_updated_at && status && (
        <span className="ml-auto text-muted-foreground">
          {STATUS_LABELS[status]} since{" "}
          {new Date(item.status_updated_at).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

/** Three-pill filter UI for the /library status bar. */
export function ReadingStatusFilter({
  value,
  onChange,
  counts,
}: {
  value: ReadingStatus | "all";
  onChange: (next: ReadingStatus | "all") => void;
  counts: { all: number; to_read: number; reading: number; read: number };
}) {
  const options: { key: ReadingStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "to_read", label: "📚 To read" },
    { key: "reading", label: "👀 Reading" },
    { key: "read", label: "✓ Read" },
  ];
  return (
    <div className="inline-flex flex-wrap items-center gap-1 text-xs">
      <span className="mr-1 inline-flex items-center gap-1 text-muted-foreground">
        <BookOpen className="h-3 w-3" aria-hidden /> Status:
      </span>
      {options.map(({ key, label }) => {
        const active = value === key;
        const count = counts[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            disabled={count === 0 && key !== "all"}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5",
              active
                ? "border-accent bg-accent text-accent-foreground"
                : "hover:bg-muted",
              count === 0 && key !== "all" && "opacity-40",
            )}
          >
            {label}
            <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
              {count}
            </span>
            {active && key !== "all" && <Check className="h-2.5 w-2.5" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
