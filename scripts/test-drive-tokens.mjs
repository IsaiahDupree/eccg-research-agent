#!/usr/bin/env node
// Try each candidate refresh token against the ECCG/Recordings folder.
// Print which one (if any) has the Drive scope we need.

import { readFileSync } from "node:fs";

const ECCG = "1i0dl8vuuwv2XaAZ6bqxM2mNPvPuRDR5q";

const CANDIDATES = [
  { label: "autonomous-outreach-agent", path: "C:/Users/Isaia/Documents/Coding/autonomous-outreach-agent/.env" },
  { label: "Medium",                    path: "C:/Users/Isaia/Documents/Coding/Medium/.env" },
  { label: "PersonalCRM push",          path: "C:/Users/Isaia/Documents/Coding/PersonalCRM push/.env" },
  { label: "PersonalCRM EverReach/push", path: "C:/Users/Isaia/Documents/Coding/PersonalCRM EverReach/PersonalCRM push/.env" },
];

function readEnv(path) {
  const txt = readFileSync(path, "utf-8");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

async function mintAccess(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  return res.json();
}

async function tokenInfo(access) {
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${access}`);
  return r.json();
}

async function listFolder(access) {
  const params = new URLSearchParams({
    q: `'${ECCG}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,modifiedTime)",
    pageSize: "20",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  return { status: r.status, body: await r.json() };
}

async function checkFolderMeta(access) {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${ECCG}?fields=id,name,mimeType,capabilities(canEdit,canAddChildren),driveId&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${access}` } },
  );
  return { status: r.status, body: await r.json() };
}

for (const c of CANDIDATES) {
  console.log(`\n=== ${c.label} ===`);
  let env;
  try {
    env = readEnv(c.path);
  } catch (e) {
    console.log(`  env read failed: ${e.message}`);
    continue;
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    console.log("  missing required fields, skip");
    continue;
  }
  const tk = await mintAccess(env);
  if (!tk.access_token) {
    console.log(`  refresh failed: ${JSON.stringify(tk)}`);
    continue;
  }
  const info = await tokenInfo(tk.access_token);
  console.log(`  scope: ${info.scope ?? "(none)"}`);
  const meta = await checkFolderMeta(tk.access_token);
  console.log(`  folder meta status: ${meta.status} title="${meta.body?.name ?? "—"}" canAddChildren=${meta.body?.capabilities?.canAddChildren ?? "?"}`);
  const list = await listFolder(tk.access_token);
  if (list.status === 200) {
    console.log(`  folder list: ${list.body.files?.length ?? 0} files`);
    for (const f of list.body.files ?? []) console.log(`    - ${f.name} (${f.mimeType})`);
  } else {
    console.log(`  folder list: status ${list.status} body=${JSON.stringify(list.body).slice(0, 200)}`);
  }
}
