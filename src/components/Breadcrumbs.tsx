import Link from "next/link";
import { ChevronRight } from "lucide-react";

const SITE_URL =
  process.env.SITE_URL?.trim() || "https://eccg-research-agent.vercel.app";

export interface Crumb {
  /** Anchor text — keep it short + keyword-rich for SEO. */
  label: string;
  /** Absolute path on the site. Omit for the final (current-page) crumb. */
  href?: string;
}

interface Props {
  trail: Crumb[];
  /** Inject Schema.org BreadcrumbList JSON-LD alongside the visible UI. */
  includeJsonLd?: boolean;
}

/**
 * Site-wide breadcrumb trail with Schema.org BreadcrumbList markup.
 *
 * SERPs use the JSON-LD to render breadcrumb chips above each result;
 * visible UI helps users understand where they are inside a deep
 * hierarchy. Wired into every /paper, /author, /n, /meetings/[id] page.
 *
 * Last crumb in `trail` is treated as the current page (no link rendered).
 */
export function Breadcrumbs({ trail, includeJsonLd = true }: Props) {
  if (trail.length === 0) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: c.href ? `${SITE_URL}${c.href}` : undefined,
    })),
  };

  return (
    <>
      {includeJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          {trail.map((c, i) => {
            const isLast = i === trail.length - 1;
            return (
              <li key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />
                )}
                {isLast || !c.href ? (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={isLast ? "text-foreground font-medium" : ""}
                  >
                    {c.label}
                  </span>
                ) : (
                  <Link
                    href={c.href}
                    className="rounded hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {c.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
