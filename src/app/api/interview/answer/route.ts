import { answerInterviewRequestSchema } from '@/schemas/evaluation.schema';
import { createRequestContext, withRequestUser } from '@/server/request-context';
import { handleRouteError, successResponse } from '@/server/response';
import { assertInterviewSession, getSessionAccessState } from '@/server/session';
import { parseJsonBody } from '@/server/validation';
import { interviewService } from '@/services/interview.service';

export async function POST(request: Request): Promise<Response> {
  const context = createRequestContext(request);

  try {
    const state = await getSessionAccessState();

    assertInterviewSession(state);

    const userContext = withRequestUser(context, state.userId);
    const payload = await parseJsonBody(
      request,
      answerInterviewRequestSchema,
      'Interview answer request is invalid.',
    );
    // The service enforces per-principal ownership, so a guest cannot drive
    // another principal's session even with a valid interview cookie.
    const progress = await interviewService.answer(state.userId, payload);

    return successResponse(userContext, {
      status: progress.state.status,
      currentProbe: progress.state.currentProbe,
      completed: progress.completed,
      turns: progress.state.turns,
      verdict: progress.verdict,
    });
  } catch (error) {
    return handleRouteError(context, error);
  }
}
