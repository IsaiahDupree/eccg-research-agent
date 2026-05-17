import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HeaderNav } from "@/components/HeaderNav";
import { HeaderSearch } from "@/components/HeaderSearch";
import { IdentityChip } from "@/components/IdentityChip";
import { NicheChip } from "@/components/NicheChip";
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
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:shadow-lg focus-visible:ring-2 focus-visible:ring-accent"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
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
            <div className="flex min-w-0 items-center gap-2">
              <Suspense fallback={null}>
                <HeaderSearch />
              </Suspense>
              <div className="hidden md:flex items-center gap-2">
                <NicheChip />
                <IdentityChip />
              </div>
            </div>
            <HeaderNav />
          </div>
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 pb-2 md:hidden sm:px-6">
            <NicheChip />
            <IdentityChip />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="mx-auto max-w-7xl px-4 py-10 text-xs text-muted-foreground sm:px-6">
          <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-baseline sm:justify-between">
            <p className="max-w-3xl">
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
            <nav className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Secondary">
              <Link href="/about" className="hover:text-foreground hover:underline">About</Link>
              <Link href="/feed.xml" className="hover:text-foreground hover:underline">RSS</Link>
              <a
                href="https://github.com/IsaiahDupree/eccg-research-agent"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground hover:underline"
              >
                GitHub
              </a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
