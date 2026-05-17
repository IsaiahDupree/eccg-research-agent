import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search",
  description:
    "Unified search across papers, meeting transcripts, and the team library.",
  alternates: { canonical: "/search" },
  openGraph: { title: "Search — ECCG Research Agent" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
