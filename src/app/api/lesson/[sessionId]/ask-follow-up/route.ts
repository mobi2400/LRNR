import { getSessionAccessState } from '@/server/session';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { assertUnlockedOwnerSession } from '@/server/session-state';
import { parseJsonBody } from '@/server/validation';
import { answerLessonFollowUp } from '@/services/lesson.service';
import { followUpRequestSchema } from '@/schemas/lesson.schema';

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(
  request: Request,
  contextInput: RouteContext,
): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertUnlockedOwnerSession(state);

    const params = await contextInput.params;
    const payload = await parseJsonBody(
      request,
      followUpRequestSchema,
      'Lesson follow-up request is invalid.',
    );
    const userContext = withRequestUser(context, state.userId);
    const result = await answerLessonFollowUp(
      {
        userId: state.userId,
        requestId: context.requestId,
      },
      {
        sessionId: params.sessionId,
        question: payload.question,
      },
    );

    return successResponse(userContext, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
}
