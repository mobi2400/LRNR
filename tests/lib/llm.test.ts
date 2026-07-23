import '../setup-env';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { generateStructured, runToolAgent } from '@/lib/llm';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function modelTurn(parts: unknown[]): unknown {
  return { candidates: [{ content: { role: 'model', parts } }] };
}

describe('Gemini structured generation wrapper', () => {
  it('uses Gemini generateContent JSON mode and validates the response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(modelTurn([{ text: JSON.stringify({ title: 'Grounded lesson' }) }])),
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
    expect(url).toContain('/models/gemini-2.5-flash:generateContent');
    expect(request.headers).toEqual(
      expect.objectContaining({ 'x-goog-api-key': expect.any(String) }),
    );
    expect(request.body).toContain('"responseMimeType":"application/json"');
  });

  it('strips a markdown JSON fence before parsing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(modelTurn([{ text: '```json\n{"title":"Fenced"}\n```' }])),
      );

    const result = await generateStructured({
      label: 'fenced',
      system: 'Return JSON.',
      prompt: 'Create one title.',
      schema: z.object({ title: z.string() }),
      fetchImpl,
    });

    expect(result).toEqual({ title: 'Fenced' });
  });
});

describe('runToolAgent function-calling loop', () => {
  it('executes a tool call, feeds the result back, and returns final JSON', async () => {
    const fetchImpl = vi
      .fn()
      // Round 1: the model asks to call the tool.
      .mockResolvedValueOnce(
        jsonResponse(
          modelTurn([
            { functionCall: { name: 'fetch_evidence', args: { query: 'agents' } } },
          ]),
        ),
      )
      // Round 2: with the evidence in context, the model returns the answer.
      .mockResolvedValueOnce(
        jsonResponse(modelTurn([{ text: JSON.stringify({ summary: 'grounded' }) }])),
      );
    const executeTool = vi.fn().mockResolvedValue({ facts: ['a', 'b'] });

    const result = await runToolAgent({
      label: 'research',
      system: 'Research then answer.',
      prompt: 'Summarize agents.',
      schema: z.object({ summary: z.string() }),
      tools: [
        {
          name: 'fetch_evidence',
          description: 'Fetch evidence for a query.',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      ],
      executeTool,
      fetchImpl,
    });

    expect(result).toEqual({ summary: 'grounded' });
    expect(executeTool).toHaveBeenCalledWith('fetch_evidence', { query: 'agents' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // The second request must carry the tool result back as a functionResponse.
    const [, secondRequest] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(secondRequest.body).toContain('functionResponse');
    expect(secondRequest.body).toContain('"facts"');
  });

  it('forces a final JSON answer when the tool budget is exhausted', async () => {
    // A fresh Response per call: a Response body can only be read once.
    const toolTurn = () =>
      jsonResponse(modelTurn([{ functionCall: { name: 'loop', args: {} } }]));
    const fetchImpl = vi
      .fn()
      // Every bounded round keeps calling the tool...
      .mockResolvedValueOnce(toolTurn())
      .mockResolvedValueOnce(toolTurn())
      // ...then the forced final round returns JSON.
      .mockResolvedValueOnce(
        jsonResponse(modelTurn([{ text: JSON.stringify({ summary: 'forced' }) }])),
      );

    const result = await runToolAgent({
      label: 'looping',
      system: 'Answer.',
      prompt: 'Go.',
      schema: z.object({ summary: z.string() }),
      tools: [
        {
          name: 'loop',
          description: 'A tool the model over-calls.',
          parameters: { type: 'object', properties: {} },
        },
      ],
      executeTool: vi.fn().mockResolvedValue({}),
      maxToolRounds: 2,
      fetchImpl,
    });

    expect(result).toEqual({ summary: 'forced' });
    // The last request drops tools and requests JSON mode.
    const lastCall = fetchImpl.mock.calls.at(-1) as [string, RequestInit];
    expect(lastCall[1].body).toContain('"responseMimeType":"application/json"');
  });
});
