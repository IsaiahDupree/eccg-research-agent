/**
 * Tiny alias-allowlist for write operations on shared Drive state.
 *
 * Set EDITORS=isaiah,rick,alexis (comma-separated) on the Vercel project
 * to restrict writes to those aliases. When EDITORS is unset, anyone is
 * an editor — current default since the team is small and trust is high.
 *
 * This is intentionally NOT identity (no signature, no cryptographic
 * proof). It's a small friction speed-bump that prevents the random
 * person who finds the public URL from changing the team's weights.
 * For real identity, add magic-link auth (deferred).
 */

const env = (process.env.EDITORS ?? "").trim();
const ALLOW: Set<string> | null =
  env.length === 0
    ? null
    : new Set(env.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

export function isEditor(alias: string | null | undefined): boolean {
  if (ALLOW === null) return true; // unrestricted
  if (!alias) return false;
  return ALLOW.has(alias.toLowerCase());
}

export function isEditorsEnforced(): boolean {
  return ALLOW !== null;
}

export function listEditors(): string[] {
  return ALLOW ? Array.from(ALLOW) : [];
}
