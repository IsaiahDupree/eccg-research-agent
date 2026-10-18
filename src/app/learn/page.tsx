import { ExternalLink } from "lucide-react";
import resources from "@/fixtures/learning_resources.json" with { type: "json" };
import { Badge } from "@/components/Badge";

export const dynamic = "force-static";

interface ResourceItem {
  title: string;
  kind: string;
  url: string;
  duration?: string;
  source?: string;
}

interface Track {
  slug: string;
  label: string;
  description: string;
  items: ResourceItem[];
}

const KIND_LABELS: Record<string, string> = {
  video: "Video",
  paper: "Paper",
  repo: "Repo",
  docs: "Docs",
  dataset: "Dataset",
  search: "Search",
  tool: "Tool",
  visualization: "Viz",
};

export default function LearnPage() {
  const tracks = (resources as { tracks: Track[] }).tracks;
  return (
    <>
      <section className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Learn</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Curated tracks for getting up to speed on event-based vision —
          modeled on the hackr.io tutorial-aggregator pattern, but specialised
          to the ECCG community. Every item links to a canonical external
          resource.
        </p>
      </section>
      <div className="space-y-8">
        {tracks.map((t) => (
          <section key={t.slug}>
            <header className="mb-3">
              <h2 className="text-lg font-medium">{t.label}</h2>
              <p className="text-sm text-muted-foreground">{t.description}</p>
            </header>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {t.items.map((i) => (
                <li
                  key={i.url}
                  className="flex flex-col justify-between rounded-lg border p-4 transition-colors hover:bg-muted/40"
                >
                  <a
                    href={i.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium leading-snug group-hover:underline">
                        {i.title}
                      </span>
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </div>
                  </a>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">
                      {KIND_LABELS[i.kind] ?? i.kind}
                    </Badge>
                    {i.duration && <span>{i.duration}</span>}
                    {i.source && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{i.source}</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
