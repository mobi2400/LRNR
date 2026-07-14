import { unlockRequestSchema } from '@/schemas/auth.schema';
import {
  createRequestContext,
  withRequestUser,
} from '@/server/request-context';
import {
  handleRouteError,
  successResponse,
} from '@/server/response';
import { unlockOwnerSession } from '@/server/session';
import { parseJsonBody } from '@/server/validation';

export async function POST(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const parsedBody = await parseJsonBody(
      request,
      unlockRequestSchema,
      'Unlock request is invalid.',
    );
    const result = await unlockOwnerSession(parsedBody.accessSecret);

    return successResponse(
      withRequestUser(context, result.userId),
      {
        isUnlocked: result.isUnlocked,
        unlockedUntil: result.unlockedUntil,
      },
    );
  } catch (error) {
    return handleRouteError(context, error);
  }
}
