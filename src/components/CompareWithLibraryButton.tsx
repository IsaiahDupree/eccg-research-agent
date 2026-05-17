"use client";

import { useRouter } from "next/navigation";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { useLibrary } from "@/lib/library_client";

interface CompareWithLibraryButtonProps {
  currentPaperId: string;
  className?: string;
  /** How many of the most-recently-saved library entries to include. */
  topN?: number;
}

/**
 * Drops the user onto /compare pre-filled with the current paper plus
 * their N most-recently-saved library items. If their library is empty,
 * the button is disabled with a helpful tooltip.
 */
export function CompareWithLibraryButton({
  currentPaperId,
  className,
  topN = 3,
}: CompareWithLibraryButtonProps) {
  const router = useRouter();
  const { items, loaded } = useLibrary();

  const others = items
    .filter((i) => i.paper_id !== currentPaperId)
    .slice(0, topN);
  const ids = [currentPaperId, ...others.map((i) => i.paper_id)];

  const disabled = loaded && others.length === 0;

  function onClick() {
    if (disabled) return;
    router.push(`/compare?ids=${ids.map((id) => encodeURIComponent(id)).join(",")}`);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!loaded || disabled}
      title={
        !loaded
          ? "Loading library…"
          : disabled
            ? "Save at least one other paper to your library first."
            : `Open /compare with this paper + ${others.length} of your saved papers`
      }
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      }
    >
      {!loaded ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <GitCompareArrows className="h-4 w-4" />
      )}
      Compare with library
    </button>
  );
}
