"use client";

import { User } from "lucide-react";
import { useEffect, useState } from "react";
import { getIdentity, setAlias } from "@/lib/identity";

const KEY = "eccg-identity/v1";

export function IdentityChip() {
  const [alias, setAliasState] = useState<string>("anonymous");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setAliasState(getIdentity().alias);
    function onStorage(e: StorageEvent) {
      if (e.key === KEY || e.key === null) setAliasState(getIdentity().alias);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function commit() {
    if (!draft.trim()) {
      setEditing(false);
      return;
    }
    const next = setAlias(draft.trim());
    setAliasState(next.alias);
    setEditing(false);
  }

  if (!mounted) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground">
        <User className="h-3 w-3" /> …
      </span>
    );
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
        className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-1.5 text-xs"
      >
        <User className="h-3 w-3 text-muted-foreground" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder="your name"
          className="w-28 bg-transparent outline-none"
          maxLength={40}
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(alias === "anonymous" ? "" : alias);
        setEditing(true);
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-muted"
      title="Set your display name (used on notes & votes)"
    >
      <User className="h-3 w-3" />
      {alias}
    </button>
  );
}
