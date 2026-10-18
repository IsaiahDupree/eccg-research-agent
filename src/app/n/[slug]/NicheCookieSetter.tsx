"use client";

import { useEffect } from "react";

/**
 * Set the niche cookie so that the rest of the app's niche-aware widgets
 * (PaperList filter, header switcher) follow along once the user lands on
 * /n/<slug>. Client-only because cookie writes need document.cookie.
 */
export function NicheCookieSetter({ slug }: { slug: string }) {
  useEffect(() => {
    document.cookie = `eccg-niche=${encodeURIComponent(slug)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent("eccg-niche-sync"));
  }, [slug]);
  return null;
}
