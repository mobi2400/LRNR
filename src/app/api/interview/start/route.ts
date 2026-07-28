import { startInterviewRequestSchema } from '@/schemas/evaluation.schema';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { assertInterviewSession, getSessionAccessState } from '@/server/session';
import { parseJsonBody } from '@/server/validation';
import { interviewService } from '@/services/interview.service';

export async function POST(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    // Owner (unlocked) or interview-scoped guest only. A guest that reaches an
    // owner route instead hits assertUnlockedOwnerSession and gets 403.
    assertInterviewSession(state);

    const userContext = withRequestUser(context, state.userId);
    const payload = await parseJsonBody(
      request,
      startInterviewRequestSchema,
      'Interview start request is invalid.',
    );
    const session = await interviewService.start(state.userId, payload);

    return successResponse(userContext, {
      sessionId: session.sessionId,
      topicSlug: session.topicSlug,
      status: session.status,
      currentProbe: session.currentProbe,
      turnCap: session.turnCap,
    });
  } catch (error) {
    return handleRouteError(context, error);
  }
}
