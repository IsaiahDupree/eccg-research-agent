import { loadSeedPipeline } from "@/lib/seed";
import { InfluenceMap } from "@/components/InfluenceMap";
import { PaperMap } from "@/components/PaperMap";
import { getIntentCounts } from "@/lib/citations";

export const dynamic = "force-static";

export default function MapPage() {
  const result = loadSeedPipeline();
  const replicationByPaper: Record<string, number> = {};
  const citedByPaper: Record<string, number> = {};
  for (const s of result.scored) {
    const ic = getIntentCounts(s.paper.id);
    replicationByPaper[s.paper.id] = ic.replication;
    citedByPaper[s.paper.id] = ic.total;
  }
  return (
    <>
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Influence map</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Each dot is a paper, plotted by <em>publish year</em> and{" "}
          <em>how many corpus papers built on it</em>. Inspired by{" "}
          <a
            className="underline"
            href="https://hylz-2019.github.io/Neuro_Vision_Map/map.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Neuro_Vision_Map
          </a>{" "}
          but for paper-level influence rather than institutions. Top-right of
          the plot is recent work that&apos;s already being replicated; bottom
          is work that hasn&apos;t accrued in-corpus citations yet.
        </p>
      </section>
      <InfluenceMap
        scored={result.scored}
        replicationByPaper={replicationByPaper}
        citedByPaper={citedByPaper}
      />

      <section className="mt-12">
        <h2 className="text-lg font-medium">Category clusters</h2>
        <p className="mb-3 mt-1 max-w-2xl text-sm text-muted-foreground">
          The category-cluster view of the corpus is preserved below, for when
          you want to browse by sub-area instead of influence.
        </p>
        <PaperMap scored={result.scored} />
      </section>
    </>
  );
}
