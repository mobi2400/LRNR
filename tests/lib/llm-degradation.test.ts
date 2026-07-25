import '../setup-env';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  detectDegradation,
  generateStructured,
  LlmDegradedError,
} from '@/lib/llm';
import { createRequestBudget } from '@/lib/llm-budget';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function modelTurn(
  parts: unknown[],
  finishReason?: string,
): unknown {
  return {
    candidates: [
      {
        ...(finishReason ? { finishReason } : {}),
        content: { role: 'model', parts },
      },
    ],
  };
}

function geminiParsed(
  parts: { text?: string }[],
  finishReason?: string,
) {
  return {
    candidates: [
      {
        ...(finishReason ? { finishReason } : {}),
        content: { role: 'model', parts },
      },
    ],
  };
}

describe('llm degradation detection', () => {
  it('detects templated fallback output as degradation', () => {
    const templates = [
      "I'm just a large language model, I can't help with that.",
      'As a language model, I cannot provide real-time information.',
      "I cannot access external databases or files.",
      "I'm not able to browse the internet.",
      "Sorry, I can't provide specific investment advice.",
    ];

    for (const text of templates) {
      const result = detectDegradation(
        text,
        geminiParsed([{ text }]),
        'gemini-flash-latest',
      );
      expect(result).toEqual({
        degraded: true,
        reason: 'templated_fallback',
        model: 'gemini-flash-latest',
        responseLength: text.length,
      });
    }
  });

  it('detects empty output as degradation', () => {
    const result = detectDegradation(
      '',
      geminiParsed([{ text: '' }]),
      'gemini-flash-latest',
    );
    expect(result).toEqual({
      degraded: true,
      reason: 'empty_content',
      model: 'gemini-flash-latest',
      responseLength: 0,
    });
  });

  it('detects SAFETY finishReason as degradation', () => {
    const result = detectDegradation(
      '',
      geminiParsed([], 'SAFETY'),
      'gemini-flash-latest',
    );
    expect(result).toEqual({
      degraded: true,
      reason: 'safety_blocked',
      model: 'gemini-flash-latest',
      responseLength: 0,
    });
  });

  it('detects RECITATION finishReason as degradation', () => {
    const result = detectDegradation(
      'some text',
      geminiParsed([{ text: 'some text' }], 'RECITATION'),
      'gemini-flash-latest',
    );
    expect(result).toEqual({
      degraded: true,
      reason: 'recitation_blocked',
      model: 'gemini-flash-latest',
      responseLength: 9,
    });
  });

  it('passes through normal structured output', () => {
    const content = JSON.stringify({ score: 3, critique: 'Solid answer.' });
    const result = detectDegradation(
      content,
      geminiParsed([{ text: content }]),
      'gemini-flash-latest',
    );
    expect(result).toEqual({ degraded: false });
  });

  it('reports degradation metadata with the error', async () => {
    const templateResponse =
      "I'm just a large language model and I cannot evaluate code.";
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(modelTurn([{ text: templateResponse }])),
    );

    try {
      await generateStructured({
        label: 'judge_call',
        system: 'Judge the answer.',
        prompt: 'Evaluate this.',
        schema: z.object({ score: z.number() }),
        fetchImpl,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmDegradedError);
      const degraded = error as LlmDegradedError;
      expect(degraded.info.degraded).toBe(true);
      expect(degraded.info.reason).toBe('templated_fallback');
      expect(degraded.info.model).toBe('gemini-flash-latest');
      expect(degraded.info.responseLength).toBeGreaterThan(0);
    }
  });
});

describe('llm budget — paired instances', () => {
  it('two budget instances with split limits sum to the configured total', () => {
    const TOTAL_RPM = 20;
    const INTERVIEW_SHARE = 0.4;
    const MAIN_SHARE = 1 - INTERVIEW_SHARE;

    const interviewBudget = createRequestBudget({
      requestsPerMinute: Math.floor(TOTAL_RPM * INTERVIEW_SHARE),
    });
    const mainBudget = createRequestBudget({
      requestsPerMinute: Math.floor(TOTAL_RPM * MAIN_SHARE),
    });

    expect(
      Math.floor(TOTAL_RPM * INTERVIEW_SHARE) +
        Math.floor(TOTAL_RPM * MAIN_SHARE),
    ).toBeLessThanOrEqual(TOTAL_RPM);

    expect(interviewBudget.inFlightWindow()).toBe(0);
    expect(mainBudget.inFlightWindow()).toBe(0);
  });
});
