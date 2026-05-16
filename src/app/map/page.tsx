import { loadSeedPipeline } from "@/lib/seed";
import { PaperMap } from "@/components/PaperMap";

export const dynamic = "force-static";

export default function MapPage() {
  const result = loadSeedPipeline();
  return (
    <>
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Corpus map</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Papers clustered by ECCG taxonomy category. Node size reflects citation
          count; click any node for the full digest. Inspired by{" "}
          <a
            className="underline"
            href="https://hylz-2019.github.io/Neuro_Vision_Map/map.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Neuro_Vision_Map
          </a>
          , but laid out by sub-area rather than institution.
        </p>
      </section>
      <PaperMap scored={result.scored} />
    </>
  );
}
