/**
 * GET /api/auth/callback?code=…&state=…
 *
 * Exchanges the auth code for tokens, verifies the email via tokeninfo,
 * sets the eccg_session cookie, and redirects to `state` (defaults to
 * /settings).
 */

import { NextResponse } from "next/server";
import {
  isSessionConfigured,
  sessionCookie,
  signSession,
  type SessionPayload,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isSessionConfigured()) {
    return NextResponse.redirect(new URL("/settings?auth=unconfigured", req.url));
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "/settings";
  if (!code) {
    return NextResponse.redirect(new URL(state + "?auth=denied", req.url));
  }

  const origin = process.env.SITE_URL?.trim() || url.origin;
  const redirectUri = `${origin}/api/auth/callback`;

  // Exchange code for tokens
  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!.trim(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokRes.ok) {
    const body = await tokRes.text();
    return NextResponse.redirect(
      new URL(`${state}?auth=token_exchange_failed&detail=${encodeURIComponent(body.slice(0, 120))}`, req.url),
    );
  }
  const tk = (await tokRes.json()) as { id_token?: string; access_token?: string };
  if (!tk.id_token) {
    return NextResponse.redirect(new URL(`${state}?auth=no_id_token`, req.url));
  }

  // Verify the ID token to get the verified email
  const infoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tk.id_token)}`,
  );
  if (!infoRes.ok) {
    return NextResponse.redirect(new URL(`${state}?auth=id_token_invalid`, req.url));
  }
  const info = (await infoRes.json()) as {
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    picture?: string;
    sub?: string;
  };
  if (!info.email || info.email_verified === "false" || info.email_verified === false || !info.sub) {
    return NextResponse.redirect(new URL(`${state}?auth=email_unverified`, req.url));
  }

  const payload: SessionPayload = {
    email: info.email,
    name: info.name,
    picture: info.picture,
    sub: info.sub,
    issued_at: Math.floor(Date.now() / 1000),
  };
  const token = signSession(payload);
  if (!token) {
    return NextResponse.redirect(new URL(`${state}?auth=signing_failed`, req.url));
  }

  const res = NextResponse.redirect(new URL(`${state}?auth=ok`, req.url));
  res.headers.set("set-cookie", sessionCookie(token));
  return res;
}
