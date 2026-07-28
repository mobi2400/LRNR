import { z } from 'zod';

import { interviewReactionRequestSchema } from '@/schemas/evaluation.schema';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { assertInterviewSession, getSessionAccessState } from '@/server/session';
import { parseJsonBody, parseWithSchema } from '@/server/validation';
import { interviewService } from '@/services/interview.service';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

const sessionIdSchema = z.string().uuid();

/**
 * The verdict screen's single "was any of this wrong?" capture. Optional by
 * design — the client never blocks the second-interview action behind it — but
 * for unattended guest sessions it is the only signal on whether the judge was
 * right, so it is recorded server-side next to the verdict.
 */
export async function POST(
  request: Request,
  contextInput: RouteContext,
): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertInterviewSession(state);

    const params = await contextInput.params;
    const sessionId = parseWithSchema(
      sessionIdSchema,
      params.sessionId,
      'Interview session id is invalid.',
    );
    const payload = await parseJsonBody(
      request,
      interviewReactionRequestSchema,
      'Interview reaction request is invalid.',
    );
    const userContext = withRequestUser(context, state.userId);
    const reaction = await interviewService.recordReaction(
      state.userId,
      sessionId,
      payload,
    );

    return successResponse(userContext, {
      recordedAt: reaction.recordedAt,
    });
  } catch (error) {
    return handleRouteError(context, error);
  }
}
