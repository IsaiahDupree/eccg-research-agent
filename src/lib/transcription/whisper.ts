/**
 * OpenAI Whisper transcription.
 *
 * Direct multipart upload (not the SDK) to keep the surface small and
 * predictable in serverless runtimes — the OpenAI SDK wraps `fetch` in
 * a Node File/Blob path that's been flaky for large audio uploads.
 *
 * Whisper limit: 25MB. For larger files the caller must chunk.
 */

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration_seconds?: number;
  model: string;
}

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_BYTES = 25 * 1024 * 1024;

export async function transcribeAudio(
  audio: ArrayBuffer | Blob,
  filename: string,
  opts: { language?: string; mimeType?: string } = {},
): Promise<TranscriptionResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const bytes =
    audio instanceof ArrayBuffer ? audio.byteLength : (audio as Blob).size;
  if (bytes > MAX_BYTES) {
    throw new Error(
      `audio too large for Whisper: ${bytes} bytes > ${MAX_BYTES} (25MB)`,
    );
  }

  const mimeType =
    opts.mimeType ??
    (audio instanceof Blob && audio.type ? audio.type : mimeFromExt(filename));

  const blob =
    audio instanceof Blob
      ? audio
      : new Blob([new Uint8Array(audio)], { type: mimeType });

  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  if (opts.language) form.append("language", opts.language);

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`whisper ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    text: string;
    language?: string;
    duration?: number;
  };
  return {
    text: json.text,
    language: json.language,
    duration_seconds: json.duration,
    model: "openai/whisper-1",
  };
}

function mimeFromExt(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    default:
      return "audio/mpeg";
  }
}
