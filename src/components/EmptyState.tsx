import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  cta?: { href: string; label: string } | { onClick: () => void; label: string };
  className?: string;
}

/**
 * Standard empty / zero-state. Icon + headline + short description + a
 * single CTA. Used by /library, /review, /leaderboard so all empty views
 * read the same way.
 */
export function EmptyState({ icon: Icon, title, description, cta, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <div className="mt-1.5 max-w-md text-xs text-muted-foreground">
          {description}
        </div>
      )}
      {cta && "href" in cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {cta.label}
        </Link>
      )}
      {cta && "onClick" in cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-4 inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
