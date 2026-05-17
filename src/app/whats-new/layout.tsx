import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What's new",
  description:
    "Most recently added papers to the ECCG corpus — daily arXiv discoveries, team uploads, and gap fills.",
  alternates: { canonical: "/whats-new" },
  openGraph: {
    title: "What's new — ECCG Research Agent",
    description: "Latest additions to the event-camera research corpus.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
