/**
 * Cookie-based session helpers for the Google OAuth flow.
 *
 * Session payload is a tiny JSON object signed with HMAC-SHA256 using
 * SESSION_SECRET. The signed value lives in an HttpOnly, Secure, SameSite=Lax
 * cookie. No external store — the cookie *is* the session.
 *
 * Why this shape (not next-auth):
 *   - we already have the Drive OAuth client + tokens
 *   - users are tiny (founding 3 + casual readers)
 *   - one dep is enough; no DB, no jose, no @auth/core
 *
 * Required env:
 *   SESSION_SECRET — any 32+ char random string (rotate to invalidate)
 *   GOOGLE_DRIVE_CLIENT_ID / _SECRET — already configured for Drive auth
 *
 * Server-side only — never import from a "use client" module.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  email: string;
  name?: string;
  picture?: string;
  sub: string;          // Google subject id
  issued_at: number;    // epoch sec
}

export const COOKIE_NAME = "eccg_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string | null {
  return process.env.SESSION_SECRET?.trim() || null;
}

export function isSessionConfigured(): boolean {
  return Boolean(
    getSecret() &&
      process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim(),
  );
}

function b64url(buf: Buffer | Uint8Array | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4;
  const padded = s + "=".repeat(pad === 0 ? 0 : 4 - pad);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(value: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(value).digest());
}

/** Sign a payload into a cookie-safe string. */
export function signSession(payload: SessionPayload): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const body = b64url(JSON.stringify(payload));
  const sig = sign(body, secret);
  return `${body}.${sig}`;
}

/** Verify + decode. Returns null on tampering / missing secret / expiry. */
export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf-8")) as SessionPayload;
    const ageSec = Math.floor(Date.now() / 1000) - payload.issued_at;
    if (ageSec > MAX_AGE_SEC) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Cookie header string for setting a session. Pass to Response. */
export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE_SEC}; HttpOnly; SameSite=Lax; Secure`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

/**
 * Read the session from a Request's cookies. Server-only.
 */
export function readSessionFromRequest(req: Request): SessionPayload | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(/;\s*/)) {
    if (part.startsWith(`${COOKIE_NAME}=`)) {
      return verifySession(part.slice(COOKIE_NAME.length + 1));
    }
  }
  return null;
}
