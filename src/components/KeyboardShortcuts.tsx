"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, X as XIcon } from "lucide-react";

/**
 * Global keyboard shortcuts.
 *
 *   /              focus the header search field
 *   ?              toggle this cheat-sheet
 *   g h            home
 *   g l            library
 *   g r            review queue
 *   g b            leaderboard
 *   g s            settings
 *   g f            /search
 *   Esc            close any open overlay
 *
 * Shortcuts are scoped to non-input contexts so typing into a field
 * doesn't accidentally navigate. The g-prefix uses a 600ms window to
 * keep it discoverable but forgiving.
 */

interface ShortcutDef {
  keys: string;
  label: string;
}

const SHORTCUTS: { group: string; items: ShortcutDef[] }[] = [
  {
    group: "Navigate",
    items: [
      { keys: "g h", label: "Home / Papers" },
      { keys: "g l", label: "Library" },
      { keys: "g r", label: "Review queue" },
      { keys: "g b", label: "Leaderboard" },
      { keys: "g s", label: "Settings" },
      { keys: "g f", label: "Search" },
    ],
  },
  {
    group: "Actions",
    items: [
      { keys: "/", label: "Focus header search" },
      { keys: "?", label: "Show this cheat-sheet" },
      { keys: "Esc", label: "Close menus / overlays" },
    ],
  },
];

const G_PREFIX_WINDOW_MS = 600;

const TARGETS: Record<string, string> = {
  h: "/",
  l: "/library",
  r: "/review",
  b: "/leaderboard",
  s: "/settings",
  f: "/search",
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const gPrefixedRef = useRef<number | null>(null);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      // Allow Esc to escape any context, including form inputs.
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      // Ignore everything else when the user is typing.
      if (isEditableTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'form[role="search"] input[type="search"]',
        );
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }
      // g-prefix sequence: first press records the timestamp, the second
      // key within the window navigates.
      const now = Date.now();
      if (gPrefixedRef.current && now - gPrefixedRef.current < G_PREFIX_WINDOW_MS) {
        const target = TARGETS[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        gPrefixedRef.current = null;
        return;
      }
      if (e.key.toLowerCase() === "g") {
        gPrefixedRef.current = now;
      }
    },
    [router],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <>
      {/* Trigger pill in the bottom-right of the viewport. Subtle until
          hovered or focused; clicking opens the same overlay as `?`. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Keyboard shortcuts"
        className="fixed bottom-3 right-3 z-20 hidden items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:inline-flex"
      >
        <Keyboard className="h-3 w-3" aria-hidden />
        <kbd className="rounded bg-muted px-1 font-mono text-[10px]">?</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kbd-shortcuts-title"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-xl border bg-background shadow-2xl"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2
                id="kbd-shortcuts-title"
                className="flex items-center gap-1.5 text-sm font-semibold"
              >
                <Keyboard className="h-4 w-4" aria-hidden /> Keyboard shortcuts
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <XIcon className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="space-y-4 p-4 text-sm">
              {SHORTCUTS.map((group) => (
                <div key={group.group}>
                  <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.group}
                  </h3>
                  <ul className="space-y-1">
                    {group.items.map(({ keys, label }) => (
                      <li
                        key={keys}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-muted/50"
                      >
                        <span className="text-foreground">{label}</span>
                        <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {keys}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
