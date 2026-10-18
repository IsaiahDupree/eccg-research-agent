"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, MessageSquare } from "lucide-react";

interface ReasonEntry {
  voter: string;
  reason: string;
  voted_at: string;
}

interface Props {
  paperId: string;
}

/**
 * Drops in under the VoteWidget on /paper/[id]. Lazy-loads the reasons
 * from /api/votes/[id]/reasons; hides entirely when there's nothing to
 * show. Reasons are short (≤200 chars at write time) so we render them
 * inline rather than truncating.
 */
export function VoteReasonsPanel({ paperId }: Props) {
  const [up, setUp] = useState<ReasonEntry[]>([]);
  const [down, setDown] = useState<ReasonEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/votes/${encodeURIComponent(paperId)}/reasons`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setUp(Array.isArray(j.up) ? j.up : []);
        setDown(Array.isArray(j.down) ? j.down : []);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [paperId]);

  if (!loaded) return null;
  if (up.length === 0 && down.length === 0) return null;

  return (
    <section className="mt-6 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-medium">
        <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
        Why the team voted{" "}
        <span className="text-xs text-muted-foreground">
          ({up.length + down.length})
        </span>
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Reasons voters left when they cast their vote. Useful when the
        net is split — a paper with 5 ups and 4 downs reads very
        differently depending on what each camp said.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {up.length > 0 && (
          <Column
            icon={ArrowUp}
            title={`Up (${up.length})`}
            tone="emerald"
            entries={up}
          />
        )}
        {down.length > 0 && (
          <Column
            icon={ArrowDown}
            title={`Down (${down.length})`}
            tone="rose"
            entries={down}
          />
        )}
      </div>
    </section>
  );
}

function Column({
  icon: Icon,
  title,
  tone,
  entries,
}: {
  icon: typeof ArrowUp;
  title: string;
  tone: "emerald" | "rose";
  entries: ReasonEntry[];
}) {
  const tint =
    tone === "emerald"
      ? "border-l-emerald-500"
      : "border-l-rose-500";
  const iconColor =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-rose-700 dark:text-rose-400";
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3 w-3 ${iconColor}`} aria-hidden />
        {title}
      </h3>
      <ul className="space-y-2 text-sm">
        {entries.map((e, i) => (
          <li
            key={`${e.voted_at}-${i}`}
            className={`border-l-2 ${tint} pl-3`}
          >
            <p className="text-foreground">“{e.reason}”</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              — <strong>{e.voter}</strong> ·{" "}
              {new Date(e.voted_at).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
