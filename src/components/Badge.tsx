import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline" | "accent" | "success" | "muted";
}

export function Badge({ className, variant = "default", ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        variant === "default" && "bg-muted text-foreground",
        variant === "outline" && "border text-foreground",
        variant === "accent" && "bg-accent text-accent-foreground",
        variant === "success" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
        variant === "muted" && "bg-muted text-muted-foreground",
        className,
      )}
      {...rest}
    />
  );
}
