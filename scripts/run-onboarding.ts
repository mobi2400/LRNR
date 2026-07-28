/**
 * Drives a full onboarding + first-lesson preparation for the owner, headlessly.
 *
 * This is the same path the UI walks (start goal → answer the adaptive interview
 * → prepare), so it produces a real, persisted, grounded curriculum for the
 * owner's current topic. Use it to verify that grounding works end-to-end after
 * the Part 1 fixes, without clicking through the browser.
 *
 * Run:  pnpm onboard "master Apache Kafka for backend systems"
 *
 * Note: this replaces the owner's current topic with the goal below. It makes
 * several paced LLM calls, so it can take a minute or two.
 */
import { randomUUID } from 'node:crypto';

import { getRedisClient } from '../src/lib/redis';
import { getCurriculumMap } from '../src/services/curriculum.service';
import { onboardingService } from '../src/services/onboarding.service';
import { hashIdempotencyRequest } from '../src/server/idempotency';
import { serverConfig } from '../src/server/config';
import type { DbActor } from '../src/db/repository-helpers';

const GOAL = process.argv[2] ?? 'master Apache Kafka for backend systems';

// Canned but realistic answers for the adaptive interview. The Architect asks
// up to five questions; any beyond these reuse the last answer.
const ANSWERS = [
  "I'm building event-driven backend services and need Kafka to be reliable in production, not just a demo.",
  "I've built REST APIs in Node/TypeScript and used RabbitMQ a little, but I've never run Kafka in production.",
  'Kafka is a distributed append-only log: producers write to partitioned topics and consumers read by offset within consumer groups. I get the basics but I am fuzzy on rebalancing and exactly-once semantics.',
  'I tried the quickstart but got stuck on consumer-group offset commits and delivery guarantees. I can spend about an hour a day.',
  'That is about as far as my current understanding goes — I want the path to take me the rest of the way.',
];

function envelopeData<T>(envelope: unknown): T {
  const record = envelope as { ok?: boolean; data?: T; error?: { message?: string } };

  if (record.ok !== true || record.data === undefined) {
    throw new Error(record.error?.message ?? 'Onboarding step failed.');
  }

  return record.data;
}

async function main(): Promise<void> {
  const userId = serverConfig.owner.userId;

  if (userId === null) {
    throw new Error('OWNER_USER_ID is required to run onboarding for the owner.');
  }

  const actor: DbActor = { userId, requestId: `onboard:${randomUUID()}` };

  console.log(`Goal: "${GOAL}"`);
  console.log('Starting onboarding…');

  const startRoute = '/api/goals/start';
  const startKey = randomUUID();
  const startPayload = { goal: GOAL };
  const startEnvelope = await onboardingService.startGoal(
    actor,
    startPayload,
    startRoute,
    startKey,
    hashIdempotencyRequest(startRoute, startPayload, userId),
  );

  const started = envelopeData<{ onboardingId: string; firstQuestion: string }>(
    startEnvelope,
  );
  console.log(`Q1: ${started.firstQuestion}`);

  const replyRoute = '/api/onboarding/reply';
  let completed = false;

  for (let turn = 0; turn < 6 && !completed; turn += 1) {
    const answer = ANSWERS[Math.min(turn, ANSWERS.length - 1)]!;
    console.log(`A${turn + 1}: ${answer}`);

    const payload = { onboardingId: started.onboardingId, answer };
    const key = randomUUID();
    const envelope = await onboardingService.submitReply(
      actor,
      payload,
      replyRoute,
      key,
      hashIdempotencyRequest(replyRoute, payload, userId),
    );
    const data = envelopeData<{
      status: string;
      nextQuestion?: string;
      topicBriefId?: string;
    }>(envelope);

    if (data.status === 'completed') {
      completed = true;
      console.log('Interview complete — preparing the first lesson (this runs the pipeline)…');
    } else if (data.nextQuestion !== undefined) {
      console.log(`Q${turn + 2}: ${data.nextQuestion}`);
    }
  }

  if (!completed) {
    console.log('Interview did not converge within the turn budget.');
  }

  // Read back the persisted curriculum to check grounding.
  const map = await getCurriculumMap(actor);

  console.log('\n─────────────────────────────────────────────');
  console.log('Resulting curriculum');
  console.log('─────────────────────────────────────────────');
  console.log(`topicSlug : ${map.topicSlug}`);
  console.log(`grounding : ${map.roadmap?.grounding ?? '(none)'}`);
  console.log(`sessions  : ${map.sessions.length}`);
  for (const session of map.sessions) {
    console.log(`  - ${session.title}  [${session.phase}/${session.status}]`);
  }

  if (map.roadmap?.grounding === 'model') {
    console.log('\n✓ GROUNDED: sessions were designed by the model from real research.');
  } else if (map.roadmap?.grounding === 'fallback') {
    console.log(
      '\n⚠ FALLBACK: the pipeline degraded to the offline scaffold (check the server\n' +
        '  logs for cartographer.synthesis_fallback / curriculum_builder.design_fallback,\n' +
        '  usually a transient rate limit). The sessions are goal-shaped but not researched.',
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('Onboarding run failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    getRedisClient().disconnect();
    process.stdout.write('', () => process.exit(process.exitCode ?? 0));
  });
