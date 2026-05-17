/**
 * Telegram notifier. Reuses @openqualls_bot from existing infra.
 *
 * Uses HTML parse mode rather than Markdown — paper titles often contain
 * unescaped `[`, `]`, `(`, `)` that break Telegram's legacy Markdown parser
 * (seen in production: titles like "$h$-control: Training-Free…" tripped
 * "can't parse entities" 400s). HTML mode only needs `<`, `>`, `&` escaped.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN     bot token
 *   TELEGRAM_CHAT_ID       chat to send to (Isaiah's by default)
 *
 * Silent no-op when either env is missing — calls can be safely sprinkled
 * across handlers without breaking dev mode.
 */

export interface TelegramSendResult {
  ok: boolean;
  message_id?: number;
  error?: string;
}

const TG_API = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export async function sendTelegram(
  html: string,
  opts: { silent?: boolean; disablePreview?: boolean } = {},
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    return { ok: false, error: "telegram_not_configured" };
  }
  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html.slice(0, 4000),
        parse_mode: "HTML",
        disable_notification: opts.silent ?? false,
        disable_web_page_preview: opts.disablePreview ?? false,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `telegram ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = (await res.json()) as { result?: { message_id: number } };
    return { ok: true, message_id: json.result?.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Escape characters Telegram's HTML parser reserves: `<`, `>`, `&`. */
export function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build a `<a href=…>` link, escaping both pieces. */
export function tgLink(title: string, url: string): string {
  return `<a href="${htmlEscape(url)}">${htmlEscape(title)}</a>`;
}

/** Back-compat alias kept for any callsite that still imports tgEscape. */
export function tgEscape(s: string): string {
  return htmlEscape(s);
}
