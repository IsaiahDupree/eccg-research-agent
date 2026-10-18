/**
 * Google Drive source for ECCG meeting recordings.
 *
 * OAuth-backed via the Drive-scoped refresh token captured by
 * `scripts/drive-auth.mjs`. Supports listing, downloading, and uploading to
 * shared folders that the authenticated user has access to.
 *
 * Folder env: ECCG_RECORDINGS_FOLDER_ID (default: ECCG Recordings).
 */

import {
  DriveAuthUnavailableError,
  getDriveAccessToken,
  isDriveAuthConfigured,
} from "../google/auth";

export const ECCG_RECORDINGS_FOLDER_ID =
  process.env.ECCG_RECORDINGS_FOLDER_ID ?? "1i0dl8vuuwv2XaAZ6bqxM2mNPvPuRDR5q";

const AUDIO_MIMES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "video/mp4", // many recorders emit m4a as video/mp4
];

export interface DriveAudioFile {
  id: string;
  name: string;
  mime_type: string;
  size?: number;
  modified_at: string;
  webViewLink?: string;
}

interface DriveListResp {
  files?: {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime: string;
    webViewLink?: string;
  }[];
}

async function authHeader(): Promise<HeadersInit> {
  const token = await getDriveAccessToken();
  return { Authorization: `Bearer ${token}` };
}

/**
 * List audio files in the configured Recordings folder.
 * Returns [] when auth isn't configured or the folder is empty.
 */
export async function listEccgRecordings(): Promise<DriveAudioFile[]> {
  if (!isDriveAuthConfigured()) return [];

  const params = new URLSearchParams({
    q: `'${ECCG_RECORDINGS_FOLDER_ID}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const url = `https://www.googleapis.com/drive/v3/files?${params}`;

  try {
    const res = await fetch(url, { headers: await authHeader() });
    if (!res.ok) return [];
    const json = (await res.json()) as DriveListResp;
    return (json.files ?? [])
      .filter((f) => AUDIO_MIMES.some((m) => f.mimeType.startsWith(m)))
      .map((f) => ({
        id: f.id,
        name: f.name,
        mime_type: f.mimeType,
        size: f.size ? Number(f.size) : undefined,
        modified_at: f.modifiedTime,
        webViewLink: f.webViewLink,
      }));
  } catch {
    return [];
  }
}

/**
 * Download a Drive file as an ArrayBuffer. Used as Whisper input.
 */
export async function downloadDriveAudio(fileId: string): Promise<ArrayBuffer | null> {
  if (!isDriveAuthConfigured()) return null;
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  try {
    const res = await fetch(url, { headers: await authHeader() });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  size?: number;
}

/**
 * Upload an audio file to the ECCG Recordings folder.
 *
 * Uses Drive's multipart upload endpoint. Bytes-in-memory limit matches the
 * route's runtime memory; for large files (>50MB) prefer a client-direct
 * upload (Drive resumable URL signed server-side) — V1.1.
 */
export async function uploadAudioToEccg(
  audio: ArrayBuffer | Blob,
  filename: string,
  opts: { mimeType?: string; folderId?: string; description?: string } = {},
): Promise<DriveFileMeta> {
  if (!isDriveAuthConfigured()) throw new DriveAuthUnavailableError();
  const token = await getDriveAccessToken();

  const folderId = opts.folderId ?? ECCG_RECORDINGS_FOLDER_ID;
  const mimeType = opts.mimeType ?? (audio instanceof Blob ? audio.type : "audio/mpeg");

  const metadata = {
    name: filename,
    parents: [folderId],
    description: opts.description,
    mimeType,
  };

  // Build multipart/related body manually.
  const boundary = `eccg-${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);

  const audioBuf =
    audio instanceof Blob
      ? new Uint8Array(await audio.arrayBuffer())
      : new Uint8Array(audio);

  const body = new Uint8Array(head.byteLength + audioBuf.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(audioBuf, head.byteLength);
  body.set(tail, head.byteLength + audioBuf.byteLength);

  const url =
    "https://www.googleapis.com/upload/drive/v3/files" +
    "?uploadType=multipart&supportsAllDrives=true" +
    "&fields=id,name,mimeType,webViewLink,size";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`drive upload ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as DriveFileMeta;
  return json;
}

/**
 * Fetch metadata for a specific file. Used to enrich UI listings.
 */
export async function getDriveFileMeta(fileId: string): Promise<DriveFileMeta | null> {
  if (!isDriveAuthConfigured()) return null;
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink,size&supportsAllDrives=true`;
  try {
    const res = await fetch(url, { headers: await authHeader() });
    if (!res.ok) return null;
    return (await res.json()) as DriveFileMeta;
  } catch {
    return null;
  }
}
