"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { castVote, getMyVote, useVotes } from "@/lib/votes_client";
import { cn } from "@/lib/utils";

interface VoteWidgetProps {
  paperId: string;
  className?: string;
  showReason?: boolean;
  compact?: boolean;
}

export function VoteWidget({ paperId, className, showReason = false, compact = false }: VoteWidgetProps) {
  const { votes } = useVotes();
  const tally = votes[paperId] ?? { up: 0, down: 0, net: 0 };
  const [my, setMy] = useState<1 | -1 | 0>(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMy(getMyVote(paperId));
  }, [paperId, votes]);

  async function cast(value: 1 | -1, e?: React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (busy) return;
    setBusy(true);
    const nextValue = my === value ? 0 : value;
    try {
      await castVote(paperId, nextValue, reason.trim() || undefined);
      setMy(nextValue);
    } finally {
      setBusy(false);
    }
  }

  const arrowSize = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const buttonSize = compact ? "h-5 w-5" : "h-6 w-6";
  const padding = compact ? "px-1 py-0" : "px-1.5 py-0.5";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border text-xs",
        padding,
        className,
      )}
    >
      <button
        type="button"
        onClick={(e) => cast(1, e)}
        disabled={busy}
        aria-pressed={my === 1}
        className={cn(
          "inline-flex items-center justify-center rounded transition-colors",
          buttonSize,
          my === 1
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            : "hover:bg-muted",
        )}
        title={my === 1 ? "Remove upvote" : "Upvote — relevant"}
      >
        <ArrowUp className={arrowSize} />
      </button>
      <span
        className={cn(
          "min-w-[1.25rem] text-center tabular-nums",
          tally.net > 0 && "text-emerald-700 dark:text-emerald-400",
          tally.net < 0 && "text-rose-700 dark:text-rose-400",
        )}
      >
        {tally.net}
      </span>
      <button
        type="button"
        onClick={(e) => cast(-1, e)}
        disabled={busy}
        aria-pressed={my === -1}
        className={cn(
          "inline-flex items-center justify-center rounded transition-colors",
          buttonSize,
          my === -1
            ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
            : "hover:bg-muted",
        )}
        title={my === -1 ? "Remove downvote" : "Downvote — not relevant"}
      >
        <ArrowDown className={arrowSize} />
      </button>
      {showReason && my !== 0 && (
        <input
          type="text"
          placeholder="optional reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => {
            if (my === 1 || my === -1) cast(my);
          }}
          className="ml-2 w-40 rounded border-0 bg-transparent px-1 text-[11px] outline-none"
          maxLength={200}
        />
      )}
    </div>
  );
}
