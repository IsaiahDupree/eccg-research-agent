/**
 * GET /api/auth/google
 * Redirects to Google's OAuth consent screen with openid+email+profile.
 * Callback lands at /api/auth/callback (must be on the Authorized Redirect
 * URIs list for the configured Google OAuth client).
 */

import { NextResponse } from "next/server";
import { isSessionConfigured } from "@/lib/auth/session";

export const runtime = "nodejs";

const SCOPES = "openid email profile";

export function GET(req: Request) {
  if (!isSessionConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Sign-in not configured. Set SESSION_SECRET + GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET on Vercel, " +
          "and add this site's /api/auth/callback to the OAuth client's Authorized redirect URIs.",
      },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  const origin = process.env.SITE_URL?.trim() || url.origin;
  const redirectUri = `${origin}/api/auth/callback`;
  const state = url.searchParams.get("redirect") || "/settings";
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
