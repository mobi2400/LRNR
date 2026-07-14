import { dashboardService } from '@/services/dashboard.service';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { getSessionAccessState } from '@/server/session';
import { assertUnlockedOwnerSession } from '@/server/session-state';

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertUnlockedOwnerSession(state);

    const userContext = withRequestUser(context, state.userId);
    const result = await dashboardService.getDashboard({
      userId: state.userId,
      requestId: context.requestId,
    });

    return successResponse(userContext, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
}