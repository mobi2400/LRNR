import { redeemGuestLinkRequestSchema } from '@/schemas/evaluation.schema';
import { AppError } from '@/server/errors';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { setGuestSessionCookie } from '@/server/session';
import { parseJsonBody } from '@/server/validation';
import { interviewService } from '@/services/interview.service';

/**
 * Redeeming a guest link is unauthenticated by design: the single-use token is
 * the credential. On success it mints the interview-scoped guest cookie, which
 * every subsequent interview request authenticates with.
 */
export async function POST(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const payload = await parseJsonBody(
      request,
      redeemGuestLinkRequestSchema,
      'Guest link redemption request is invalid.',
    );
    const guestSession = await interviewService.redeem(payload.token);

    if (guestSession === null) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'This guest link is invalid or has already been used.',
        status: 404,
      });
    }

    await setGuestSessionCookie(guestSession);

    const userContext = withRequestUser(context, guestSession.guestUserId);

    return successResponse(userContext, {
      scope: guestSession.scope,
      topicSlug: guestSession.topicSlug,
      expiresAt: guestSession.expiresAt,
    });
  } catch (error) {
    return handleRouteError(context, error);
  }
}
