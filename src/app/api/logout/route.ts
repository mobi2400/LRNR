import { clearSessionCookies, getSessionAccessState } from '@/server/session';
import { AppError } from '@/server/errors';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import {
  handleRouteError,
  successResponse,
} from '@/server/response';

export async function POST(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    if (!state.isAuthenticated) {
      throw new AppError({
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue.',
        status: 401,
      });
    }

    await clearSessionCookies();

    return successResponse(withRequestUser(context, state.userId), {
      loggedOut: true,
    });
  } catch (error) {
    return handleRouteError(context, error);
  }
}
