/**
 * Lightweight client-side identity. No real auth (yet); just a localStorage
 * alias + uuid so notes / votes can be attributed and de-duplicated.
 */

const KEY = "eccg-identity/v1";

export interface Identity {
  alias: string;
  uuid: string;
}

function randomUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "u-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function getIdentity(): Identity {
  if (typeof window === "undefined") return { alias: "anonymous", uuid: "ssr" };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Identity;
      if (parsed.alias && parsed.uuid) return parsed;
    }
  } catch {
    // fall through
  }
  const fresh: Identity = { alias: "anonymous", uuid: randomUuid() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(fresh));
  } catch {
    // ignore
  }
  return fresh;
}

export function setAlias(alias: string): Identity {
  const id = getIdentity();
  const next: Identity = { ...id, alias: alias.trim().slice(0, 40) || "anonymous" };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  }
  return next;
}
