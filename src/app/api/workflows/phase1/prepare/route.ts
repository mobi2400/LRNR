import { requireIdempotencyKey } from '@/server/idempotency';
import {
  createRequestContext,
  withRequestUser,
} from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { getSessionAccessState } from '@/server/session';
import { assertUnlockedOwnerSession } from '@/server/session-state';
import { phase1PreparationService } from '@/services/phase1-preparation.service';

export async function POST(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();
    assertUnlockedOwnerSession(state);
    requireIdempotencyKey(request.headers);

    const userContext = withRequestUser(context, state.userId);
    const result = await phase1PreparationService.prepareFirstLesson({
      userId: state.userId,
      requestId: context.requestId,
    });

    return successResponse(userContext, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
}
