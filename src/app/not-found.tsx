import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mb-4 inline-grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-balance text-3xl font-semibold tracking-tight">
        We couldn&apos;t find that.
      </h1>
      <p className="mt-2 text-pretty text-sm text-muted-foreground">
        The page, paper, meeting, or author you&apos;re looking for isn&apos;t
        in the corpus. It may have been renamed during the last refresh, or
        the URL is mis-typed.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-md border bg-accent px-3 py-1.5 font-medium text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Back to papers
        </Link>
        <Link
          href="/whats-new"
          className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          What&apos;s new
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Leaderboard
        </Link>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">
        If you arrived from a bookmarked URL and think this is a regression,
        flag it on{" "}
        <a
          className="underline hover:text-foreground"
          href="https://github.com/IsaiahDupree/eccg-research-agent/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        .
      </p>
    </div>
  );
}
