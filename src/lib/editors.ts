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
const tokensEnv = (process.env.ECCG_API_TOKENS ?? "").trim();

const ALIAS_ALLOW: Set<string> | null =
  aliasesEnv.length === 0
    ? null
    : new Set(aliasesEnv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

const EMAIL_ALLOW: Set<string> | null =
  emailsEnv.length === 0
    ? null
    : new Set(emailsEnv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

interface ApiTokenEntry {
  token: string;
  attribution: string; // alias or email used for audit when this token is used
}

// ECCG_API_TOKENS=tok1:isaiah@example.com,tok2:bot-cron — comma-separated
// entries, each "token" or "token:attribution". Attribution shows up in
// the review-audit log so we know which automation cast a decision.
const API_TOKENS: ApiTokenEntry[] =
  tokensEnv.length === 0
    ? []
    : tokensEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((raw) => {
          const idx = raw.indexOf(":");
          return idx >= 0
            ? { token: raw.slice(0, idx).trim(), attribution: raw.slice(idx + 1).trim() }
            : { token: raw, attribution: "api-token" };
        });
const API_TOKEN_INDEX = new Map(API_TOKENS.map((t) => [t.token, t.attribution]));

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

/**
 * Extract an API token from a Request, looking in (1) X-API-Token header,
 * (2) Authorization: Bearer header, (3) ?api_token= query string. Returns
 * the attribution string ("alias" or "email") when the token is on the
 * allowlist, or null otherwise. Use to grant editor privileges to non-
 * browser callers (curl, GitHub Actions, cron jobs).
 */
export function readApiTokenAttribution(req: Request): string | null {
  if (API_TOKEN_INDEX.size === 0) return null;
  const header =
    req.headers.get("x-api-token") ??
    (req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null);
  const fromQuery = new URL(req.url).searchParams.get("api_token");
  const token = (header ?? fromQuery ?? "").trim();
  if (!token) return null;
  return API_TOKEN_INDEX.get(token) ?? null;
}

export function hasApiTokens(): boolean {
  return API_TOKEN_INDEX.size > 0;
}

