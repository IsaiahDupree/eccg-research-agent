import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HeaderSearch } from "@/components/HeaderSearch";
import { IdentityChip } from "@/components/IdentityChip";
import "./globals.css";

export const metadata: Metadata = {
  title: "ECCG Research Agent",
  description:
    "A research aggregator for the Event Camera Community Group. Papers, code, and citations from arXiv, Semantic Scholar, and GitHub — ranked and digested.",
  metadataBase: new URL("https://eccg-research-agent.vercel.app"),
  alternates: {
    types: {
      "application/rss+xml": [
        { url: "/feed.xml", title: "ECCG Research — Top papers" },
      ],
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-3">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-foreground text-[11px] font-bold"
              >
                EC
              </span>
              <span className="hidden sm:inline">ECCG Research Agent</span>
              <span className="sm:hidden">ECCG</span>
            </Link>
            <Suspense fallback={null}>
              <HeaderSearch />
            </Suspense>
            <IdentityChip />
            <nav className="ml-auto flex flex-wrap items-center gap-1 text-sm">
              <Link href="/" className="rounded-md px-2.5 py-1.5 hover:bg-muted">
                List
              </Link>
              <Link href="/map" className="rounded-md px-2.5 py-1.5 hover:bg-muted">
                Map
              </Link>
              <Link
                href="/timeline"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Timeline
              </Link>
              <Link
                href="/categories"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Categories
              </Link>
              <Link
                href="/institutions"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Institutions
              </Link>
              <Link
                href="/meetings"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Meetings
              </Link>
              <Link
                href="/learn"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Learn
              </Link>
              <Link
                href="/library"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Library
              </Link>
              <Link
                href="/leaderboard"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Leaderboard
              </Link>
              <Link
                href="/compare"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Compare
              </Link>
              <Link
                href="/whats-new"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                What&apos;s new
              </Link>
              <Link
                href="/upload"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Upload
              </Link>
              <Link
                href="/settings"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                Settings
              </Link>
              <Link
                href="/about"
                className="rounded-md px-2.5 py-1.5 hover:bg-muted"
              >
                About
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-6 py-10 text-xs text-muted-foreground">
          <p>
            Sources: arXiv · Semantic Scholar · GitHub · the canonical{" "}
            <a
              className="underline hover:text-foreground"
              href="https://github.com/uzh-rpg/event-based_vision_resources"
              target="_blank"
              rel="noopener noreferrer"
            >
              uzh-rpg/event-based_vision_resources
            </a>{" "}
            taxonomy. Built so researchers can spend their time on research, not on researching how to research.
          </p>
        </footer>
      </body>
    </html>
  );
}
