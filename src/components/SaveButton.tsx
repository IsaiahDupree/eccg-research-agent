"use client";

import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { useLibrary, toggleLibrary } from "@/lib/library_client";
import { cn } from "@/lib/utils";

interface SaveButtonProps {
  paperId: string;
  className?: string;
  size?: "sm" | "md";
}

export function SaveButton({ paperId, className, size = "sm" }: SaveButtonProps) {
  const { items, loaded } = useLibrary();
  const saved = items.some((i) => i.paper_id === paperId);
  const [busy, setBusy] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await toggleLibrary(paperId);
    } finally {
      setBusy(false);
    }
  }

  const Icon = busy ? Loader2 : saved ? BookmarkCheck : Bookmark;
  const dims = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from library" : "Save to library"}
      title={
        saved
          ? "In team library — click to remove"
          : loaded
            ? "Save to team library"
            : "Library loading…"
      }
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
        saved
          ? "border-accent/40 bg-accent/10 text-accent"
          : "hover:bg-muted",
        busy && "opacity-60",
        className,
      )}
    >
      <Icon className={cn(dims, busy && "animate-spin")} />
      <span suppressHydrationWarning>{saved ? "Saved" : "Save"}</span>
    </button>
  );
}
