import { ImageResponse } from "next/og";
import { loadSeedPipeline } from "@/lib/seed";

export const runtime = "nodejs"; // needs the seed loader, can't run on edge
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Paper card — ECCG Research Agent";

interface Props {
  params: { id: string };
}

/**
 * Per-paper OG image. Renders the paper title, authors, and venue on a
 * gradient backdrop so Slack/X/LinkedIn previews carry the full citation
 * up-front. Falls back gracefully when the id isn't in the corpus.
 */
export default async function Image({ params }: Props) {
  const decoded = decodeURIComponent(params.id);
  const result = loadSeedPipeline();
  const scored = result.scored.find((s) => s.paper.id === decoded);
  const title = scored?.paper.title ?? "Paper not found";
  const authors = scored?.paper.authors.slice(0, 3).map((a) => a.name).join(", ") ?? "";
  const more =
    scored && scored.paper.authors.length > 3
      ? ` +${scored.paper.authors.length - 3}`
      : "";
  const venue = scored?.paper.venue?.name ?? "arXiv preprint";
  const year = scored
    ? new Date(scored.paper.published_at).getFullYear()
    : "";
  const citations = scored?.paper.citation_count ?? 0;

  // Tighten font size for very long titles so they fit in the card.
  const titleSize = title.length > 90 ? 56 : title.length > 60 ? 68 : 80;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #4338ca 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: 22,
            opacity: 0.85,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: "white",
              color: "#4338ca",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 15,
              borderRadius: 8,
            }}
          >
            EC
          </div>
          ECCG Research Agent
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.05,
              maxHeight: 380,
              overflow: "hidden",
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 30,
              fontSize: 28,
              lineHeight: 1.3,
              opacity: 0.85,
              maxWidth: 1050,
            }}
          >
            {authors}{more}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 22,
            opacity: 0.75,
          }}
        >
          <div>
            {venue}{year ? ` · ${year}` : ""}
            {citations > 0 ? ` · ${citations} citations` : ""}
          </div>
          <div>eccg-research-agent.vercel.app</div>
        </div>
      </div>
    ),
    size,
  );
}
