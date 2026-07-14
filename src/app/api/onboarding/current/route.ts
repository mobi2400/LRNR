import { getSessionAccessState } from '@/server/session';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { assertUnlockedOwnerSession } from '@/server/session-state';
import { onboardingService } from '@/services/onboarding.service';

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertUnlockedOwnerSession(state);

    const userContext = withRequestUser(context, state.userId);
    const result = await onboardingService.getCurrent({
      userId: state.userId,
      requestId: context.requestId,
    });

    return successResponse(userContext, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
}
