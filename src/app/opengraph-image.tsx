import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ECCG Research Agent — Event-camera papers, ranked";

/**
 * Default OG image for share previews. No external fonts (would push us
 * over the edge function budget); plain system stack + a bold headline
 * and a clean two-line tagline.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #6366f1 0%, #4338ca 50%, #1e1b4b 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            opacity: 0.85,
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              background: "white",
              color: "#4338ca",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              borderRadius: 8,
            }}
          >
            EC
          </div>
          ECCG Research Agent
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 88,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.05,
          }}
        >
          Event-camera research, ranked.
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 32,
            lineHeight: 1.3,
            opacity: 0.85,
            maxWidth: 1000,
          }}
        >
          1,300+ papers from arXiv + Semantic Scholar, weighted by
          replication-strength citations and team votes.
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 22,
            opacity: 0.7,
          }}
        >
          eccg-research-agent.vercel.app
        </div>
      </div>
    ),
    size,
  );
}
