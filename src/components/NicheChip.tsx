"use client";

import { Layers } from "lucide-react";
import { useState } from "react";
import { NICHES, useNiche } from "@/lib/niche_client";
import { cn } from "@/lib/utils";

export function NicheChip() {
  const { niche, set, mounted } = useNiche();
  const [open, setOpen] = useState(false);

  if (!mounted) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground">
        <Layers className="h-3 w-3" /> …
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-muted"
        title="Switch research niche"
      >
        <Layers className="h-3 w-3" />
        {niche.label}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border bg-background shadow-md">
            <ul className="py-1">
              {NICHES.map((n) => (
                <li key={n.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      set(n.slug);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm hover:bg-muted",
                      niche.slug === n.slug && "bg-muted/60",
                    )}
                  >
                    <div className="font-medium">{n.label}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {n.description}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              The corpus is shared; the niche filters/re-ranks the same set.
              Event Camera is the primary niche; the others are scaffolded for
              future expansion.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
