import { getSessionAccessState } from '@/server/session';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import {
  hashIdempotencyRequest,
  requireIdempotencyKey,
} from '@/server/idempotency';
import { parseJsonBody } from '@/server/validation';
import { assertUnlockedOwnerSession } from '@/server/session-state';
import { onboardingService } from '@/services/onboarding.service';
import { startGoalRequestSchema } from '@/schemas/onboarding.schema';

export async function POST(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertUnlockedOwnerSession(state);

    const userContext = withRequestUser(context, state.userId);
    const payload = await parseJsonBody(
      request,
      startGoalRequestSchema,
      'Goal start request is invalid.',
    );
    const idempotencyKey = requireIdempotencyKey(request.headers);
    const route = '/api/goals/start';
    const requestHash = hashIdempotencyRequest(route, payload);
    const result = await onboardingService.startGoal(
      {
        userId: state.userId,
        requestId: context.requestId,
      },
      payload,
      route,
      idempotencyKey,
      requestHash,
    );

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return successResponse(userContext, result.data);
  } catch (error) {
    return handleRouteError(context, error);
  }
}
