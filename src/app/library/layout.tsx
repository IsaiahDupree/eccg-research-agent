import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Library",
  description:
    "Shared team library of saved event-camera papers. Tag, mark as to-read/reading/read, export as BibTeX/CSV/Markdown.",
  alternates: { canonical: "/library" },
  robots: { index: false }, // user state, not public content
  openGraph: { title: "Library — ECCG Research Agent" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
