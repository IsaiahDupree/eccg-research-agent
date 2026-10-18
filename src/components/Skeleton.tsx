import { cn } from "@/lib/utils";

/** Animated placeholder block. Use for non-trivial async UI. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-muted/60",
        className,
      )}
    />
  );
}

/** A row that mimics a PaperRow while data is loading. */
export function PaperRowSkeleton() {
  return (
    <div className="grid grid-cols-12 items-start gap-3 border-b border-border px-4 py-4 last:border-b-0">
      <div className="col-span-1 space-y-1.5 pt-0.5">
        <Skeleton className="h-3 w-6" />
        <Skeleton className="h-7 w-12" />
      </div>
      <div className="col-span-7 min-w-0 space-y-2">
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-3 w-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="col-span-4 space-y-2">
        <div className="flex justify-end">
          <Skeleton className="h-2 w-32" />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton list — call when waiting on /api/library, /api/votes, etc. */
export function PaperListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border" aria-busy="true" aria-label="Loading papers">
      {Array.from({ length: rows }).map((_, i) => (
        <PaperRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Compact one-line loader. */
export function InlineLoader({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
    >
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:.2s]" aria-hidden />
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:.4s]" aria-hidden />
      <span className="ml-1">{children}</span>
    </div>
  );
}
