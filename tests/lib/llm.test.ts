import '../setup-env';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { generateStructured } from '@/lib/llm';

describe('Gemini structured generation wrapper', () => {
  it('uses Gemini generateContent JSON mode and validates the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ title: 'Grounded lesson' }) }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await generateStructured({
      label: 'test_lesson',
      system: 'Return JSON.',
      prompt: 'Create one title.',
      schema: z.object({ title: z.string() }),
      fetchImpl,
    });

    expect(result).toEqual({ title: 'Grounded lesson' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.5-flash:generateContent');
    expect(request.headers).toEqual(
      expect.objectContaining({ 'x-goog-api-key': expect.any(String) }),
    );
    expect(request.body).toContain('"responseMimeType":"application/json"');
  });
});
