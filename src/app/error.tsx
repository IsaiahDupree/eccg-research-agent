"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: Props) {
  useEffect(() => {
    // Surface to the browser console so the user can copy/paste into a bug
    // report. Vercel captures uncaught errors server-side independently.
    console.error("ECCG route error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mb-4 inline-grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-balance text-3xl font-semibold tracking-tight">
        Something went sideways.
      </h1>
      <p className="mt-2 text-pretty text-sm text-muted-foreground">
        A page failed to render. Most often this is a transient state issue
        — try once more, and the request should succeed.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground">
          Reference id:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">{error.digest}</code>
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border bg-accent px-3 py-1.5 font-medium text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Home
        </Link>
      </div>
      <details className="mx-auto mt-8 max-w-md rounded-md border bg-muted/30 text-left text-xs">
        <summary className="cursor-pointer px-3 py-2 text-muted-foreground hover:bg-muted/60">
          Show error details
        </summary>
        <pre className="overflow-auto px-3 pb-3 text-[11px]">
          {error.message}
          {error.stack ? `\n\n${error.stack}` : null}
        </pre>
      </details>
    </div>
  );
}
