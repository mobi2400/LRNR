import { getSessionAccessState } from '@/server/session';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { assertUnlockedOwnerSession } from '@/server/session-state';
import { parseJsonBody } from '@/server/validation';
import { markLessonComplete } from '@/services/lesson.service';
import { markLessonCompleteRequestSchema } from '@/schemas/lesson.schema';
import {
  hashIdempotencyRequest,
  requireIdempotencyKey,
} from '@/server/idempotency';

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
      markLessonCompleteRequestSchema,
      'Lesson completion request is invalid.',
    );
    const idempotencyKey = requireIdempotencyKey(request.headers);
    const route = '/api/lesson/' + params.sessionId + '/mark-complete';
    const requestHash = hashIdempotencyRequest(route, payload, state.userId);
    const userContext = withRequestUser(context, state.userId);
    const result = await markLessonComplete(
      {
        userId: state.userId,
        requestId: context.requestId,
      },
      {
        sessionId: params.sessionId,
        understood: payload.understood,
        ...(payload.notes === undefined ? {} : { notes: payload.notes }),
        idempotencyKey,
        requestHash,
        route,
      },
    );

    return successResponse(userContext, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
}

