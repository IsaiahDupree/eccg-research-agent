import { Suspense } from "react";
import { loadSeedPipeline } from "@/lib/seed";
import { PaperList } from "@/components/PaperList";
import { TrendingStrip, type TrendingItem } from "@/components/TrendingStrip";

export const dynamic = "force-static";

const SITE_URL =
  process.env.SITE_URL?.trim() || "https://eccg-research-agent.vercel.app";

// Schema.org WebSite + Organization + SearchAction. The WebSite block
// enables Google's "sitelinks search box" SERP feature; the Organization
// block establishes the entity behind the aggregator so SERPs can build
// a knowledge-panel-style result.
const HOMEPAGE_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "ECCG Research Agent",
      description:
        "Continuously-updated digest of event-based-vision and neuromorphic-compute research, ranked on a 9-axis rubric and replication-strength citations.",
      inLanguage: "en",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Event Camera Community Group (ECCG)",
      alternateName: "ECCG",
      url: SITE_URL,
      description:
        "Research community tracking advances in event cameras, event-based vision, and neuromorphic computing.",
      sameAs: ["https://github.com/uzh-rpg/event-based_vision_resources"],
    },
  ],
};

export default function HomePage() {
  const result = loadSeedPipeline();
  const topVelocity = [...result.raw.velocities].sort(
    (a, b) => b.multiplier - a.multiplier,
  )[0];

  const byId = new Map(result.scored.map((s) => [s.paper.id, s]));
  // Trending = velocity multiplier with a soft recency decay so 5-year-old
  // citation magnets don't permanently camp the top. Half-life ~12 mo
  // after a 6-month "fresh" floor.
  const trending: TrendingItem[] = result.raw.velocities
    .map((v) => {
      const s = byId.get(v.paper_id);
      if (!s) return null;
      const months = s.paper.months_since_publish;
      const recency = Math.exp(-Math.max(0, months - 6) / 12);
      return {
        scored: s,
        multiplier: v.multiplier,
        trend_score: v.multiplier * recency,
      };
    })
    .filter((x): x is TrendingItem => Boolean(x))
    .filter((x) => x.multiplier >= 1.5)
    .sort((a, b) => b.trend_score - a.trend_score)
    .slice(0, 3);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOMEPAGE_JSONLD) }}
      />
      <section className="mb-8">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Event-camera research, ranked.
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          A continuously-updated digest of the latest event-based-vision papers.
          Pulled from arXiv, hydrated with Semantic Scholar citation data,
          scored by a transparent rubric, and summarized for the ECCG community.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Papers tracked" value={result.scored.length.toLocaleString()} />
          <Stat
            label="Avg score"
            value={(
              result.scored.reduce((s, p) => s + p.total, 0) /
              Math.max(1, result.scored.length)
            ).toFixed(1)}
          />
          <Stat
            label="Top velocity"
            value={
              topVelocity ? `${topVelocity.multiplier.toFixed(1)}×` : "—"
            }
            hint="vs venue baseline"
          />
          <Stat
            label="Categories"
            value={
              new Set(
                result.raw.papers
                  .map((p) => p.eccg_category)
                  .filter(Boolean),
              ).size
            }
          />
        </dl>
      </section>
      <TrendingStrip items={trending} />
      <Suspense fallback={null}>
        <PaperList scored={result.scored} />
      </Suspense>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
