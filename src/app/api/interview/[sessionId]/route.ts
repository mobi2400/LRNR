import { z } from 'zod';

import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { assertInterviewSession, getSessionAccessState } from '@/server/session';
import { parseWithSchema } from '@/server/validation';
import { interviewService } from '@/services/interview.service';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

const sessionIdSchema = z.string().uuid();

/**
 * The read behind the verdict screen: current probe (mid-interview) or the full
 * transcript + verdict (completed). Ownership is enforced in the service, so a
 * guest can only read its own session.
 */
export async function GET(
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
    const userContext = withRequestUser(context, state.userId);
    const session = await interviewService.get(state.userId, sessionId);

    return successResponse(userContext, {
      sessionId: session.sessionId,
      topicSlug: session.topicSlug,
      status: session.status,
      currentProbe: session.currentProbe,
      turnCap: session.turnCap,
      turns: session.turns,
      verdict: session.verdictSummary,
    });
  } catch (error) {
    return handleRouteError(context, error);
  }
}
