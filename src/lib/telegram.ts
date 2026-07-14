import { serverConfig } from '@/server/config';
import { AppError } from '@/server/errors';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/telegram.ts');

export interface TelegramSendMessageInput {
  chatId: string;
  text: string;
  parseMode?: 'MarkdownV2' | 'HTML';
}

export interface TelegramSendMessageResult {
  ok: true;
}

type FetchLike = typeof fetch;

export function splitTelegramMessage(
  text: string,
  maxLength = 3800,
): string[] {
  if (maxLength < 100) {
    throw new Error('Telegram message chunks must allow at least 100 characters.');
  }

  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return [trimmed];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < trimmed.length) {
    const nextSlice = trimmed.slice(cursor, cursor + maxLength);
    const lastBreak = nextSlice.lastIndexOf('\n');
    const safeLength = lastBreak > 100 ? lastBreak : nextSlice.length;
    chunks.push(nextSlice.slice(0, safeLength).trim());
    cursor += safeLength;
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

export async function sendTelegramMessage(
  input: TelegramSendMessageInput,
  fetchImpl: FetchLike = fetch,
): Promise<TelegramSendMessageResult> {
  const body: Record<string, unknown> = {
    chat_id: input.chatId,
    text: input.text,
    disable_web_page_preview: true,
  };

  if (input.parseMode !== undefined) {
    body.parse_mode = input.parseMode;
  }

  const response = await fetchImpl(
    `https://api.telegram.org/bot${serverConfig.telegram.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new AppError({
      code: 'PROVIDER_ERROR',
      message: `Telegram delivery failed with status ${response.status}.`,
      status: 502,
    });
  }

  return {
    ok: true,
  };
}
