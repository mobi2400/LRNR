import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { getSessionAccessState } from '@/server/session';
import { assertUnlockedOwnerSession } from '@/server/session-state';
import { parseJsonBody } from '@/server/validation';
import { settingsPatchSchema } from '@/schemas/settings.schema';
import { settingsService } from '@/services/settings.service';

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertUnlockedOwnerSession(state);

    const userContext = withRequestUser(context, state.userId);
    const settings = await settingsService.getSettings({
      userId: state.userId,
      requestId: context.requestId,
    });

    return successResponse(userContext, settings);
  } catch (error) {
    return handleRouteError(context, error);
  }
}

/**
 * Settings updates are naturally idempotent: the body carries the desired end
 * state for the fields it names, so replaying a PATCH converges rather than
 * accumulating. No idempotency key is required.
 */
export async function PATCH(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertUnlockedOwnerSession(state);

    const userContext = withRequestUser(context, state.userId);
    const payload = await parseJsonBody(
      request,
      settingsPatchSchema,
      'Settings update request is invalid.',
    );
    const settings = await settingsService.updateSettings(
      {
        userId: state.userId,
        requestId: context.requestId,
      },
      payload,
    );

    return successResponse(userContext, settings);
  } catch (error) {
    return handleRouteError(context, error);
  }
}
