#!/usr/bin/env node
/**
 * One-shot Google Drive OAuth flow.
 *
 * 1. Loads the OAuth client from `secrets/google-oauth.json` (web type with
 *    a localhost redirect URI) — or pass `--desktop` to use
 *    `secrets/google-oauth-desktop.json` (installed type, dynamic localhost port).
 * 2. Starts a local server bound to the redirect URI's port.
 * 3. Prints the consent URL — user opens it in a browser, approves.
 * 4. The redirect lands here, we capture the code, exchange for a refresh token.
 * 5. Writes the refresh token to `.env.local` (and prints commands to add it
 *    to Vercel).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { URL } from "node:url";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}
function readDotEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const cliId = flag("client-id");
const cliSecret = flag("client-secret");
const envFile = flag("env-file");
const jsonPath = flag(
  "client-json",
  args.includes("--desktop") ? "secrets/google-oauth-desktop.json" : "secrets/google-oauth.json",
);
const portOverride = flag("port");

let cfg;
if (cliId && cliSecret) {
  cfg = { client_id: cliId, client_secret: cliSecret, project_id: "(cli)" };
} else if (envFile) {
  const env = readDotEnv(envFile);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.error(`${envFile} missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET`);
    process.exit(1);
  }
  cfg = {
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    project_id: `(env)`,
  };
} else {
  if (!existsSync(jsonPath)) {
    console.error(`Missing ${jsonPath} — pass --env-file or --client-id/--client-secret`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const inner = raw.installed ?? raw.web;
  if (!inner) {
    console.error("Unknown OAuth client JSON shape — expected installed or web");
    process.exit(1);
  }
  cfg = inner;
}

if (!cfg.token_uri) cfg.token_uri = "https://oauth2.googleapis.com/token";

// Desktop / "installed" apps with the `http://localhost` redirect accept any
// port at consent time. Pick a free port (default 54381) and use it in the
// redirect_uri.
const port = Number(portOverride ?? 54381);
const localhostRedirect = `http://localhost:${port}/`;
const pathPart = "/";

console.log(`OAuth client: ${cfg.client_id}`);
console.log(`Project:      ${cfg.project_id}`);
console.log(`Redirect:     ${localhostRedirect}`);

const consentUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
consentUrl.searchParams.set("client_id", cfg.client_id);
consentUrl.searchParams.set("redirect_uri", localhostRedirect);
consentUrl.searchParams.set("response_type", "code");
consentUrl.searchParams.set("scope", SCOPES.join(" "));
consentUrl.searchParams.set("access_type", "offline");
consentUrl.searchParams.set("prompt", "consent");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname !== pathPart && url.pathname !== "/") {
    res.writeHead(404).end("not found");
    return;
  }
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<h1>OAuth error</h1><pre>${errorParam}</pre>`);
    console.error(`OAuth error: ${errorParam}`);
    server.close();
    process.exit(2);
    return;
  }
  if (!code) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<h1>ECCG Drive auth</h1>` +
        `<p>Waiting for Google redirect with ?code=...</p>` +
        `<p>If you opened this manually, click <a href="${consentUrl}">here</a> to start the consent.</p>`,
    );
    return;
  }

  // Exchange code for tokens
  try {
    const tokenRes = await fetch(cfg.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
        code,
        grant_type: "authorization_code",
        redirect_uri: localhostRedirect,
      }),
    });
    const tk = await tokenRes.json();
    if (!tokenRes.ok || !tk.refresh_token) {
      res.writeHead(500, { "content-type": "text/html" });
      res.end(`<h1>Token exchange failed</h1><pre>${JSON.stringify(tk, null, 2)}</pre>`);
      console.error("token exchange failed:", tk);
      server.close();
      process.exit(3);
      return;
    }
    // Confirm scope
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${tk.access_token}`,
    );
    const info = await infoRes.json();
    console.log("\n✅ Got tokens.");
    console.log(`   scope: ${info.scope ?? "(unknown)"}`);
    console.log(`   refresh_token (suffix): …${tk.refresh_token.slice(-8)}`);

    // Write to .env.local
    const envPath = ".env.local";
    let existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    function upsert(key, value) {
      const re = new RegExp(`^${key}=.*$`, "m");
      if (re.test(existing)) existing = existing.replace(re, `${key}=${value}`);
      else existing += `\n${key}=${value}`;
    }
    upsert("GOOGLE_DRIVE_CLIENT_ID", cfg.client_id);
    upsert("GOOGLE_DRIVE_CLIENT_SECRET", cfg.client_secret);
    upsert("GOOGLE_DRIVE_REFRESH_TOKEN", tk.refresh_token);
    writeFileSync(envPath, existing.trim() + "\n");
    console.log(`   wrote: ${envPath}`);
    console.log("\nTo add to Vercel production:");
    console.log("  vercel env add GOOGLE_DRIVE_CLIENT_ID production");
    console.log("  vercel env add GOOGLE_DRIVE_CLIENT_SECRET production");
    console.log("  vercel env add GOOGLE_DRIVE_REFRESH_TOKEN production");

    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<h1>Drive auth complete ✓</h1>` +
        `<p>Refresh token captured. You can close this tab.</p>`,
    );
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500).end(String(e));
    console.error(e);
    server.close();
    process.exit(4);
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Port ${port} busy. Pass --port <N> to pick another.`);
    process.exit(5);
  } else {
    console.error(e);
    process.exit(6);
  }
});
server.listen(port, () => {
  console.log(`\nLocal callback server listening on http://localhost:${port}${pathPart}`);
  console.log("\nOpen this URL in your browser to consent:");
  console.log("\n   " + consentUrl.toString() + "\n");
  console.log("Or paste it into your default browser tab now.\n");
});
