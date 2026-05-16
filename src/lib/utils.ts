import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatMonthsAgo(months: number): string {
  if (months < 1) return "this month";
  if (months < 1.5) return "1 mo ago";
  if (months < 12) return `${Math.round(months)} mo ago`;
  return `${(months / 12).toFixed(1)}y ago`;
}

export function categoryLabel(slug?: string): string {
  if (!slug) return "Unclassified";
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
