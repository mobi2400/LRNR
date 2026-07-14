import type { output, ZodType } from 'zod';

import { ValidationAppError } from '@/server/errors';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/validation.ts');

export function parseWithSchema<TSchema extends ZodType>(
  schema: TSchema,
  value: unknown,
  message = 'Request validation failed.',
): output<TSchema> {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new ValidationAppError(message, parsed.error.flatten());
  }

  return parsed.data;
}

export async function parseJsonBody<TSchema extends ZodType>(
  request: Request,
  schema: TSchema,
  message = 'Request body is invalid.',
): Promise<output<TSchema>> {
  const rawBody = await request.json().catch(() => null);

  return parseWithSchema(schema, rawBody, message);
}
