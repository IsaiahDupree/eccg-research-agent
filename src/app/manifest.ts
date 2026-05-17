import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ECCG Research Agent",
    short_name: "ECCG",
    description:
      "Event-camera + neuromorphic research, ranked. Continuously updated digest from arXiv + Semantic Scholar.",
    start_url: "/",
    display: "minimal-ui",
    background_color: "#ffffff",
    theme_color: "#6366f1",
    orientation: "portrait",
    categories: ["education", "productivity", "research"],
  };
}
