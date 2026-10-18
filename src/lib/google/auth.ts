/**
 * Google OAuth token cache for the Drive client.
 *
 * Reads GOOGLE_DRIVE_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN from env,
 * caches an access_token in-process until ~30s before its `expires_in`.
 *
 * The refresh token must be Drive-scoped (https://www.googleapis.com/auth/drive).
 * Obtain via `node scripts/drive-auth.mjs --port 54381`.
 */

interface CachedToken {
  access_token: string;
  expires_at: number; // epoch ms
}

let cache: CachedToken | null = null;
let inflight: Promise<string> | null = null;

export class DriveAuthUnavailableError extends Error {
  constructor() {
    super(
      "DRIVE_AUTH_UNAVAILABLE: missing GOOGLE_DRIVE_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN",
    );
  }
}

function readEnv(): {
  client_id: string;
  client_secret: string;
  refresh_token: string;
} | null {
  const cid = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const cs = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const rt = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!cid || !cs || !rt) return null;
  return { client_id: cid, client_secret: cs, refresh_token: rt };
}

async function refresh(): Promise<string> {
  const env = readEnv();
  if (!env) throw new DriveAuthUnavailableError();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...env, grant_type: "refresh_token" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`drive token refresh ${res.status}: ${body.slice(0, 200)}`);
  }
  const tk = (await res.json()) as { access_token: string; expires_in: number };
  cache = {
    access_token: tk.access_token,
    expires_at: Date.now() + Math.max(0, (tk.expires_in - 30) * 1000),
  };
  return tk.access_token;
}

export async function getDriveAccessToken(): Promise<string> {
  if (cache && cache.expires_at > Date.now()) return cache.access_token;
  if (inflight) return inflight;
  inflight = refresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function isDriveAuthConfigured(): boolean {
  return readEnv() !== null;
}
