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

const aliasesEnv = (process.env.EDITORS ?? "").trim();
const emailsEnv = (process.env.EDITORS_EMAILS ?? "").trim();

const ALIAS_ALLOW: Set<string> | null =
  aliasesEnv.length === 0
    ? null
    : new Set(aliasesEnv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

const EMAIL_ALLOW: Set<string> | null =
  emailsEnv.length === 0
    ? null
    : new Set(emailsEnv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

export function isEditor(
  alias: string | null | undefined,
  verifiedEmail?: string | null,
): boolean {
  // When NEITHER allowlist is set, anyone is an editor (default V1 mode).
  if (ALIAS_ALLOW === null && EMAIL_ALLOW === null) return true;
  // A verified email match wins over the alias check.
  if (verifiedEmail && EMAIL_ALLOW?.has(verifiedEmail.toLowerCase())) return true;
  if (alias && ALIAS_ALLOW?.has(alias.toLowerCase())) return true;
  return false;
}

export function isEditorsEnforced(): boolean {
  return ALIAS_ALLOW !== null || EMAIL_ALLOW !== null;
}

export function listEditors(): string[] {
  return ALIAS_ALLOW ? Array.from(ALIAS_ALLOW) : [];
}

export function listEditorEmails(): string[] {
  return EMAIL_ALLOW ? Array.from(EMAIL_ALLOW) : [];
}
