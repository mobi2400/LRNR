import { getSessionAccessState } from '@/server/session';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { assertUnlockedOwnerSession } from '@/server/session-state';
import { getCurrentLesson } from '@/services/lesson.service';

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertUnlockedOwnerSession(state);

    const userContext = withRequestUser(context, state.userId);
    const lesson = await getCurrentLesson({
      userId: state.userId,
      requestId: context.requestId,
    });

    return successResponse(userContext, lesson);
  } catch (error) {
    return handleRouteError(context, error);
  }
}
