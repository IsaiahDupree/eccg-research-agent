/**
 * Security headers middleware.
 *
 * Applied to every response (HTML + API). Defaults match modern best-
 * practice — Mozilla Observatory at A-grade for static deploys — without
 * breaking Tailwind, Next image optimisation, or third-party arXiv links.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Allowlist of hosts the app loads images / scripts / fetches from. Keep
// it tight; expand explicitly when a new third party is integrated.
const IMG_HOSTS = ["'self'", "data:", "https://arxiv.org", "https://*.arxiv.org"];
const CONNECT_HOSTS = [
  "'self'",
  "https://api.openai.com",
  "https://api.anthropic.com",
  "https://api.semanticscholar.org",
  "https://export.arxiv.org",
  "https://export.arxiv.org/rss",
  "https://www.googleapis.com",
  "https://oauth2.googleapis.com",
];

// Next 16 + Turbopack still inject inline <style> and small inline
// runtime <script> hashes. Tailwind v4's runtime injects classes via
// adopted stylesheets. The CSP needs 'unsafe-inline' for style and a
// permissive script directive for the React runtime to function.
const CSP = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src ${IMG_HOSTS.join(" ")}`,
  `font-src 'self' data:`,
  `connect-src ${CONNECT_HOSTS.join(" ")}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self' https://accounts.google.com`,
].join("; ");

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", CSP);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  // HSTS only meaningful over HTTPS (Vercel always serves over HTTPS).
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return res;
}

export const config = {
  matcher: [
    // Apply to everything except Next's internal asset routes.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
