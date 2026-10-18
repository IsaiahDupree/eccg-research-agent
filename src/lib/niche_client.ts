/**
 * Client-side niche selector. Cookie-backed so the choice persists across
 * tabs / page reloads. Same surface for SSR (reads request cookie) and
 * client (reads document.cookie).
 */

"use client";

import { useEffect, useState } from "react";
import { DEFAULT_NICHE, findNiche, NICHES, type NicheConfig } from "./niches";

const COOKIE = "eccg-niche";
const SYNC = "eccg-niche-sync";

function read(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)eccg-niche=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function write(slug: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(SYNC));
}

export function useNiche(): { niche: NicheConfig; set: (slug: string) => void; mounted: boolean } {
  const [slug, setSlug] = useState<string>(DEFAULT_NICHE.slug);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    setSlug(read() ?? DEFAULT_NICHE.slug);
    function onSync() {
      setSlug(read() ?? DEFAULT_NICHE.slug);
    }
    window.addEventListener(SYNC, onSync);
    return () => window.removeEventListener(SYNC, onSync);
  }, []);
  return {
    niche: findNiche(slug),
    set: (s: string) => {
      write(s);
      setSlug(s);
    },
    mounted,
  };
}

export { NICHES };
