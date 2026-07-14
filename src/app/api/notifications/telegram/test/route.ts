import { deliveryService } from '@/services/delivery.service';
import {
  hashIdempotencyRequest,
  requireIdempotencyKey,
} from '@/server/idempotency';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { getSessionAccessState } from '@/server/session';
import { assertUnlockedOwnerSession } from '@/server/session-state';

export async function POST(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertUnlockedOwnerSession(state);

    const userContext = withRequestUser(context, state.userId);
    const idempotencyKey = requireIdempotencyKey(request.headers);
    const route = '/api/notifications/telegram/test';
    const requestHash = hashIdempotencyRequest(route, {}, state.userId);
    const result = await deliveryService.queueTelegramTestAlert(
      {
        userId: state.userId,
        requestId: context.requestId,
      },
      idempotencyKey,
      route,
      requestHash,
    );

    return successResponse(userContext, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
}
