import { cn } from "@/lib/utils";

interface ScoreBarProps {
  value: number;        // 0-100
  className?: string;
  label?: boolean;
}

export function ScoreBar({ value, className, label = true }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    clamped >= 70 ? "bg-emerald-500" : clamped >= 50 ? "bg-amber-500" : "bg-zinc-400";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {label && (
        <span className="tabular-nums text-xs text-muted-foreground">
          {clamped.toFixed(0)}
        </span>
      )}
    </div>
  );
}
