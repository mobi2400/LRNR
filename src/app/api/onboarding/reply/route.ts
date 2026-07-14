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
import { onboardingReplyRequestSchema } from '@/schemas/onboarding.schema';

export async function POST(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertUnlockedOwnerSession(state);

    const userContext = withRequestUser(context, state.userId);
    const payload = await parseJsonBody(
      request,
      onboardingReplyRequestSchema,
      'Onboarding reply request is invalid.',
    );
    const idempotencyKey = requireIdempotencyKey(request.headers);
    const route = '/api/onboarding/reply';
    const requestHash = hashIdempotencyRequest(route, payload, state.userId);
    const result = await onboardingService.submitReply(
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
