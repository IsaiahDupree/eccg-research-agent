/**
 * Drive-backed JSON state store.
 *
 * Each named state (library, notes, votes) lives as a single JSON file in
 * the ECCG parent folder. We cache the {name → fileId} mapping per cold
 * boot, plus a 15-second in-memory cache of the parsed contents to soften
 * read latency.
 *
 * This is good enough for the founding 3-seat team. When the user count
 * grows past ~10, swap to Vercel KV / Upstash with the same API surface.
 */

import { getDriveAccessToken, isDriveAuthConfigured, DriveAuthUnavailableError } from "./auth";

const ECCG_PARENT_FOLDER =
  process.env.ECCG_DRIVE_FOLDER_ID ?? "1n_ksoGyQ8LAXzBa5rWA-t6PEUQU5tDp1";
const FILE_PREFIX = "eccg-state—";
const READ_CACHE_MS = 15_000;

interface CacheEntry<T> {
  value: T;
  loaded_at: number;
}

const fileIdCache = new Map<string, string>();
const readCache = new Map<string, CacheEntry<unknown>>();

async function findFileId(name: string): Promise<string | null> {
  if (fileIdCache.has(name)) return fileIdCache.get(name)!;
  const token = await getDriveAccessToken();
  const params = new URLSearchParams({
    q: `'${ECCG_PARENT_FOLDER}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: "files(id,name)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    pageSize: "1",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { files?: { id: string }[] };
  const id = json.files?.[0]?.id ?? null;
  if (id) fileIdCache.set(name, id);
  return id;
}

async function downloadJson<T>(fileId: string): Promise<T | null> {
  const token = await getDriveAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function uploadJson(name: string, value: unknown, existingFileId?: string): Promise<string> {
  const token = await getDriveAccessToken();
  const body = JSON.stringify(value);
  const boundary = `state-${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();

  const metadata: Record<string, unknown> = existingFileId
    ? { name }
    : { name, mimeType: "application/json", parents: [ECCG_PARENT_FOLDER] };

  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const bodyBuf = enc.encode(body);
  const buf = new Uint8Array(head.byteLength + bodyBuf.byteLength + tail.byteLength);
  buf.set(head, 0);
  buf.set(bodyBuf, head.byteLength);
  buf.set(tail, head.byteLength + bodyBuf.byteLength);

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&supportsAllDrives=true&fields=id`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id`;

  const res = await fetch(url, {
    method: existingFileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive state upload ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}

export async function readState<T>(stateName: string, defaultValue: T): Promise<T> {
  if (!isDriveAuthConfigured()) return defaultValue;
  const fileName = `${FILE_PREFIX}${stateName}.json`;
  const cached = readCache.get(stateName);
  if (cached && Date.now() - cached.loaded_at < READ_CACHE_MS) {
    return cached.value as T;
  }
  const fileId = await findFileId(fileName);
  if (!fileId) {
    readCache.set(stateName, { value: defaultValue, loaded_at: Date.now() });
    return defaultValue;
  }
  const parsed = await downloadJson<T>(fileId);
  const value = parsed ?? defaultValue;
  readCache.set(stateName, { value, loaded_at: Date.now() });
  return value;
}

export async function writeState<T>(stateName: string, value: T): Promise<void> {
  if (!isDriveAuthConfigured()) throw new DriveAuthUnavailableError();
  const fileName = `${FILE_PREFIX}${stateName}.json`;
  const existing = await findFileId(fileName);
  const id = await uploadJson(fileName, value, existing ?? undefined);
  fileIdCache.set(fileName, id);
  readCache.set(stateName, { value, loaded_at: Date.now() });
}
