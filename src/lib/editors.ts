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

/**
 * Parse an ECCG_API_TOKENS env-style spec: comma-separated entries, each
 * `token` or `token:attribution`. Returns a Map(token → attribution).
 * Exported so the parsing rules are independently testable.
 */
export function parseTokenSpec(spec: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const idx = raw.indexOf(":");
    const token = idx >= 0 ? raw.slice(0, idx).trim() : raw;
    const attribution = idx >= 0 ? raw.slice(idx + 1).trim() : "api-token";
    if (token) out.set(token, attribution || "api-token");
  }
  return out;
}

const API_TOKEN_INDEX = parseTokenSpec(tokensEnv);
const API_TOKENS: ApiTokenEntry[] = Array.from(API_TOKEN_INDEX.entries()).map(
  ([token, attribution]) => ({ token, attribution }),
);

/**
 * Resolve an API token from a Request against the provided index. Looks
 * at X-API-Token header, then Authorization: Bearer, then ?api_token=.
 * Returns the attribution when matched, else null. Pure — tests pass
 * any index they want, no env-mocking needed.
 */
export function lookupApiToken(
  req: Request,
  tokenIndex: Map<string, string>,
): string | null {
  if (tokenIndex.size === 0) return null;
  const header =
    req.headers.get("x-api-token") ??
    (req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null);
  const fromQuery = new URL(req.url).searchParams.get("api_token");
  const token = (header ?? fromQuery ?? "").trim();
  if (!token) return null;
  return tokenIndex.get(token) ?? null;
}

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
  return lookupApiToken(req, API_TOKEN_INDEX);
}

export function hasApiTokens(): boolean {
  return API_TOKEN_INDEX.size > 0;
}

