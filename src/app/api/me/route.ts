import { getSessionAccessState } from '@/server/session';
import { AppError } from '@/server/errors';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import {
  handleRouteError,
  successResponse,
} from '@/server/response';

export async function GET(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    if (
      !state.isAuthenticated ||
      state.userId === null ||
      state.email === null
    ) {
      throw new AppError({
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue.',
        status: 401,
      });
    }

    return successResponse(withRequestUser(context, state.userId), {
      id: state.userId,
      email: state.email,
      displayName: state.displayName,
      isOwner: state.isOwner,
      isUnlocked: state.isUnlocked,
      accessMode: state.accessMode,
    });
  } catch (error) {
    return handleRouteError(context, error);
  }
}
