#!/usr/bin/env node
/**
 * Upload PRD-v2.md + SOURCE_TRANSCRIPT.md into the parent ECCG folder as
 * Google Docs (Markdown → Doc conversion via Drive's `convert` flag).
 *
 * If a doc with the same title already exists in the folder, update its
 * content in place (revision); otherwise create a new doc.
 *
 * Reads creds from .env.local.
 */

import { readFileSync, existsSync } from "node:fs";

const ECCG_PARENT = "1n_ksoGyQ8LAXzBa5rWA-t6PEUQU5tDp1";

const DOCS = [
  { title: "ECCG Research Platform — PRD v2", path: "docs/PRD-v2.md" },
  { title: "Delaney Dr 4 — Source Transcript", path: "docs/SOURCE_TRANSCRIPT.md" },
];

function readEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function getAccessToken(env) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const tk = await r.json();
  if (!tk.access_token) throw new Error(`token refresh failed: ${JSON.stringify(tk)}`);
  return tk.access_token;
}

async function findExisting(token, title) {
  const params = new URLSearchParams({
    q: `'${ECCG_PARENT}' in parents and name = '${title.replace(/'/g, "\\'")}' and trashed = false`,
    fields: "files(id,name,mimeType,modifiedTime)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  return (j.files ?? [])[0] ?? null;
}

async function listFolder(token) {
  const params = new URLSearchParams({
    q: `'${ECCG_PARENT}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,modifiedTime)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  return j.files ?? [];
}

async function createOrUpdate(token, title, mdBody) {
  const existing = await findExisting(token, title);
  const enc = new TextEncoder();
  const boundary = `prd-${Math.random().toString(36).slice(2)}`;

  if (existing) {
    // Update in place — keep the existing fileId, replace the content.
    const meta = { name: title };
    const head = enc.encode(
      `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: text/markdown\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--\r\n`);
    const body = new Uint8Array(head.byteLength + mdBody.byteLength + tail.byteLength);
    body.set(head, 0);
    body.set(mdBody, head.byteLength);
    body.set(tail, head.byteLength + mdBody.byteLength);
    const r = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,modifiedTime`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    if (!r.ok) throw new Error(`update ${title}: ${r.status} ${await r.text()}`);
    const j = await r.json();
    return { action: "updated", file: j };
  }

  // Create new — convert markdown to a Google Doc.
  const meta = {
    name: title,
    mimeType: "application/vnd.google-apps.document",
    parents: [ECCG_PARENT],
  };
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/markdown\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.byteLength + mdBody.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(mdBody, head.byteLength);
  body.set(tail, head.byteLength + mdBody.byteLength);
  const r = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,modifiedTime`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!r.ok) throw new Error(`create ${title}: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return { action: "created", file: j };
}

const env = existsSync(".env.local") ? readEnv(".env.local") : process.env;
if (!env.GOOGLE_DRIVE_CLIENT_ID || !env.GOOGLE_DRIVE_CLIENT_SECRET || !env.GOOGLE_DRIVE_REFRESH_TOKEN) {
  console.error("Missing Drive creds in .env.local");
  process.exit(1);
}

const token = await getAccessToken(env);

console.log("=== Existing files in ECCG parent folder ===");
for (const f of await listFolder(token)) {
  console.log(`  - ${f.name}  (${f.mimeType})  ${f.modifiedTime}`);
}
console.log("");

for (const doc of DOCS) {
  const md = readFileSync(doc.path);
  const res = await createOrUpdate(token, doc.title, md);
  console.log(`${res.action.padEnd(8)} "${doc.title}"`);
  console.log(`  id: ${res.file.id}`);
  console.log(`  url: ${res.file.webViewLink}`);
  console.log(`  modified: ${res.file.modifiedTime}`);
}
