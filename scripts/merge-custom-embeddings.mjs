#!/usr/bin/env node
/**
 * Pull `eccg-state—custom-embeddings.json` from Drive and merge into the
 * local embeddings cache (`.cache/embeddings.json`). After this runs,
 * `node scripts/backfill-embeddings.mjs` re-computes the static
 * `eccg_similarities.json` against the union of bundled-corpus + cron-added
 * vectors, so cron-added papers get real top-K neighbours.
 *
 * Required env: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET,
 * GOOGLE_DRIVE_REFRESH_TOKEN — same trio that the production app uses.
 *
 * Run:
 *   node scripts/merge-custom-embeddings.mjs
 *   node scripts/backfill-embeddings.mjs   # then rebuild similarities
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ECCG_PARENT_FOLDER =
  process.env.ECCG_DRIVE_FOLDER_ID ?? "1n_ksoGyQ8LAXzBa5rWA-t6PEUQU5tDp1";
const STATE_FILE = "eccg-state—custom-embeddings.json";
const CACHE_PATH = ".cache/embeddings.json";

async function getAccessToken() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    console.error(
      "Need GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN env vars",
    );
    process.exit(1);
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  }
  const j = await res.json();
  return j.access_token;
}

async function fetchState(token) {
  const params = new URLSearchParams({
    q: `'${ECCG_PARENT_FOLDER}' in parents and name = '${STATE_FILE}' and trashed = false`,
    fields: "files(id,name)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    pageSize: "1",
  });
  const list = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!list.ok) throw new Error(`drive list ${list.status}`);
  const data = await list.json();
  const id = data.files?.[0]?.id;
  if (!id) {
    console.log(`no ${STATE_FILE} yet — nothing to merge`);
    return null;
  }
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`drive download ${r.status}`);
  return r.json();
}

const token = await getAccessToken();
const customEmbeds = await fetchState(token);
if (!customEmbeds || Object.keys(customEmbeds).length === 0) {
  console.log("nothing to merge");
  process.exit(0);
}
console.log(`fetched ${Object.keys(customEmbeds).length} custom embeddings from Drive`);

let cache = {};
if (existsSync(CACHE_PATH)) {
  cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
}
console.log(`local cache has ${Object.keys(cache).length} entries`);

let added = 0;
let overwritten = 0;
for (const [id, rec] of Object.entries(customEmbeds)) {
  if (cache[id]) overwritten++;
  else added++;
  // The cache schema is `{ id -> vector }`; the Drive state wraps in
  // { vector, hash, embedded_at }. Strip the wrapper.
  cache[id] = rec.vector ?? rec;
}

mkdirSync(dirname(CACHE_PATH), { recursive: true });
writeFileSync(CACHE_PATH, JSON.stringify(cache));
console.log(`merged: ${added} new, ${overwritten} updated`);
console.log(`local cache now has ${Object.keys(cache).length} entries`);
console.log(`next: run \`node scripts/backfill-embeddings.mjs\` to rebuild similarities.`);
