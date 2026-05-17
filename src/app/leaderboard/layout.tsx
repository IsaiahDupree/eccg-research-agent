import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "Team-voted event-camera papers ranked by community votes, replication-strength citations, and editor weighting. Switch between Top, Hot, Influence, and Controversial views.",
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "Leaderboard — ECCG Research Agent",
    description:
      "Event-camera papers ranked by community votes + replication-strength citations.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
