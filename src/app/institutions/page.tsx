import { loadSeedPipeline } from "@/lib/seed";
import institutions from "@/fixtures/institutions.json" with { type: "json" };

export const dynamic = "force-static";

interface Institution {
  name: string;
  long_name: string;
  city: string;
  country: string;
  lon: number;
  lat: number;
}

interface Affiliation {
  author: string;
  institution: string;
}

interface InstWithCount extends Institution {
  paper_count: number;
  paper_ids: string[];
}

function project(lon: number, lat: number, w: number, h: number): { x: number; y: number } {
  // Equirectangular (Plate Carrée), with a small vertical squish so labels
  // breathe and Antarctica doesn't dominate. Adequate for a stylised map.
  const x = ((lon + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return { x, y };
}

export default function InstitutionsPage() {
  const data = institutions as {
    institutions: Institution[];
    author_affiliations: Affiliation[];
  };

  // Build inst -> papers index via author affiliations
  const result = loadSeedPipeline();
  const affByAuthor = new Map<string, string>();
  for (const a of data.author_affiliations) affByAuthor.set(a.author, a.institution);

  const counts = new Map<string, Set<string>>();
  for (const s of result.scored) {
    for (const a of s.paper.authors) {
      const inst = affByAuthor.get(a.name);
      if (!inst) continue;
      if (!counts.has(inst)) counts.set(inst, new Set());
      counts.get(inst)!.add(s.paper.id);
    }
  }
  const enriched: InstWithCount[] = data.institutions
    .map((i) => ({
      ...i,
      paper_count: counts.get(i.name)?.size ?? 0,
      paper_ids: Array.from(counts.get(i.name) ?? []),
    }))
    .sort((a, b) => b.paper_count - a.paper_count);

  const W = 960;
  const H = 480;

  return (
    <>
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Institutions</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Geographic view of the institutions producing the event-camera
          corpus. Inspired by{" "}
          <a
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
            href="https://hylz-2019.github.io/Neuro_Vision_Map/map.html"
          >
            Neuro_Vision_Map
          </a>
          . Dot size scales with the count of corpus papers from authors
          affiliated to that lab.
        </p>
      </section>
      <div className="rounded-lg border bg-background">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-[480px] w-full"
          role="img"
          aria-label="World map of event-camera research institutions"
        >
          {/* Background graticule */}
          <rect width={W} height={H} fill="var(--muted)" opacity={0.4} />
          {Array.from({ length: 12 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={(i * W) / 12}
              x2={(i * W) / 12}
              y1={0}
              y2={H}
              stroke="currentColor"
              opacity={0.08}
            />
          ))}
          {Array.from({ length: 7 }, (_, i) => (
            <line
              key={`h${i}`}
              y1={(i * H) / 6}
              y2={(i * H) / 6}
              x1={0}
              x2={W}
              stroke="currentColor"
              opacity={0.08}
            />
          ))}
          {/* Equator and meridian */}
          <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" opacity={0.2} />
          <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="currentColor" opacity={0.2} />

          {enriched.map((inst) => {
            const { x, y } = project(inst.lon, inst.lat, W, H);
            const r = 4 + Math.sqrt(inst.paper_count) * 3.5;
            const hasPapers = inst.paper_count > 0;
            return (
              <g key={inst.name} transform={`translate(${x},${y})`}>
                {hasPapers && (
                  <circle
                    r={r + 4}
                    fill="rgb(99 102 241)"
                    opacity={0.15}
                  />
                )}
                <circle
                  r={Math.max(3, r)}
                  fill={hasPapers ? "rgb(99 102 241)" : "var(--muted-foreground)"}
                  fillOpacity={hasPapers ? 0.85 : 0.4}
                  stroke="var(--background)"
                  strokeWidth={1}
                />
                <text
                  x={r + 4}
                  y={3}
                  className="text-[10px]"
                  fill="currentColor"
                  opacity={0.75}
                >
                  {inst.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <section className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          By paper count
        </h2>
        <ul className="mt-2 divide-y rounded-lg border">
          {enriched.map((inst) => (
            <li
              key={inst.name}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium">{inst.long_name}</div>
                <div className="text-xs text-muted-foreground">
                  {inst.city}, {inst.country}
                </div>
              </div>
              <div className="tabular-nums text-sm text-muted-foreground">
                {inst.paper_count} paper{inst.paper_count === 1 ? "" : "s"}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
