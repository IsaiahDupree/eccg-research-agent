/**
 * Tiny "saved papers" library — localStorage backed, no server state.
 *
 * The Zotero pattern: a personal collection that survives across sessions.
 * V1.1 can promote this to a cloud-synced library if multi-device matters.
 */

const KEY = "eccg-research-agent/library/v1";

export interface SavedItem {
  paper_id: string;
  saved_at: string;
}

function safeRead(): SavedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(items: SavedItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage may be full or disabled — drop silently.
  }
}

export function getLibrary(): SavedItem[] {
  return safeRead();
}

export function isSaved(paperId: string): boolean {
  return safeRead().some((i) => i.paper_id === paperId);
}

export function toggleSaved(paperId: string): boolean {
  const items = safeRead();
  const idx = items.findIndex((i) => i.paper_id === paperId);
  if (idx >= 0) {
    items.splice(idx, 1);
    safeWrite(items);
    return false;
  }
  items.unshift({ paper_id: paperId, saved_at: new Date().toISOString() });
  safeWrite(items);
  return true;
}

export function clearLibrary(): void {
  safeWrite([]);
}
