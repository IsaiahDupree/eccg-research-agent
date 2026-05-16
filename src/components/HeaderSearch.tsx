"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";

/**
 * Global search field in the header. Submits to `/?q=...` so the homepage
 * filters the corpus. Synchronises with the URL `q` param when present.
 */
export function HeaderSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = q.trim();
    router.push(next ? `/?q=${encodeURIComponent(next)}` : "/");
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      role="search"
      className="hidden sm:flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm focus-within:border-accent"
    >
      <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search papers, authors, abstracts…"
        className="w-64 bg-transparent outline-none placeholder:text-muted-foreground"
        aria-label="Search corpus"
      />
    </form>
  );
}
