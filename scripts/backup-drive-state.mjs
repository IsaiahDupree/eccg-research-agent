#!/usr/bin/env node
/**
 * Disaster-recovery: snapshot every `eccg-state—*.json` in the Drive
 * folder into `backups/<UTC-date>/` locally. Run weekly via cron from
 * a personal machine, or before any risky state migration.
 *
 *   GOOGLE_DRIVE_CLIENT_ID=… GOOGLE_DRIVE_CLIENT_SECRET=… \
 *   GOOGLE_DRIVE_REFRESH_TOKEN=… \
 *   node scripts/backup-drive-state.mjs
 *
 * Restore is manual: pick the backup file you want and upload it via
 * Drive UI replacing the live state. No automatic restore — that's
 * intentional, so a bad backup can't silently overwrite a good state.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ECCG_PARENT_FOLDER =
  process.env.ECCG_DRIVE_FOLDER_ID ?? "1n_ksoGyQ8LAXzBa5rWA-t6PEUQU5tDp1";
const PREFIX = "eccg-state—";
const OUT_ROOT = "backups";

async function token() {
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
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function listStateFiles(accessToken) {
  // Drive doesn't support a "starts with" filter in q; use `name contains`
  // and filter the result client-side.
  const params = new URLSearchParams({
    q: `'${ECCG_PARENT_FOLDER}' in parents and name contains 'eccg-state' and trashed = false`,
    fields: "files(id,name,modifiedTime,size)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    pageSize: "100",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`drive list ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.files ?? []).filter((f) => f.name.startsWith(PREFIX));
}

async function download(accessToken, fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`drive download ${res.status}`);
  return res.text();
}

const accessToken = await token();
const files = await listStateFiles(accessToken);
if (files.length === 0) {
  console.log("no state files found in Drive folder");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(OUT_ROOT, stamp);
mkdirSync(outDir, { recursive: true });

console.log(`backing up ${files.length} state file(s) → ${outDir}`);
let totalBytes = 0;
for (const f of files) {
  const body = await download(accessToken, f.id);
  const outPath = join(outDir, f.name);
  writeFileSync(outPath, body);
  totalBytes += body.length;
  console.log(`  ${f.name.padEnd(45)} ${(body.length / 1024).toFixed(1)} kB`);
}

const manifest = {
  backed_up_at: new Date().toISOString(),
  drive_folder_id: ECCG_PARENT_FOLDER,
  files: files.map((f) => ({
    name: f.name,
    id: f.id,
    drive_modified_time: f.modifiedTime,
    drive_size: f.size,
  })),
  total_bytes: totalBytes,
};
writeFileSync(join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nwrote _manifest.json — total ${(totalBytes / 1024).toFixed(1)} kB`);
