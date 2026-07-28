import { extendCurriculumFromGaps } from '@/agents/curriculum-builder/curriculum-builder-agent';
import { curriculumRepository } from '@/db/curriculum.repo';
import { profileRepository } from '@/db/profile.repo';
import type { DbActor } from '@/db/repository-helpers';
import { appLogger } from '@/lib/logger';
import { meetsMasteryBar, readMasterySummary } from '@/lib/mastery';
import {
  curriculumSessionSchema,
  layer1RoadmapSchema,
} from '@/schemas/curriculum.schema';
import type { InterviewVerdict } from '@/schemas/evaluation.schema';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/services/mastery-progression.service.ts');

/**
 * Applies an evaluation verdict to the learner's live curriculum — the heart of
 * "learn to mastery, not to 100%".
 *
 * A path no longer simply ends at the last planned session. When the learner
 * demonstrates mastery of the goal (verdict clears the depth bar with no open
 * gaps) the path is marked complete. When they do not, the cited gaps become
 * grounded reinforcement sessions appended to the path, and the loop continues —
 * bounded by the safety caps in the extension engine.
 */

export type MasteryProgressionResult =
  | { status: 'no_active_topic' }
  | { status: 'no_curriculum' }
  | { status: 'topic_mismatch' }
  | { status: 'mastered' }
  | { status: 'extended'; added: number; reinforcedConcepts: string[]; capped: boolean }
  | { status: 'capped' };

/** The subset of `stableMasterySummary` that carries the progression loop state. */
function readProgression(stableMasterySummary: Record<string, unknown>) {
  return readMasterySummary(stableMasterySummary.progression);
}

export interface MasteryProgressionDeps {
  profileRepository: Pick<typeof profileRepository, 'getCurrentProfile' | 'upsertProfile'>;
  curriculumRepository: Pick<
    typeof curriculumRepository,
    'getActiveCurriculum' | 'appendSessionsAndSetPointer'
  >;
}

const defaultDeps: MasteryProgressionDeps = {
  profileRepository,
  curriculumRepository,
};

export function createMasteryProgressionService(
  deps: MasteryProgressionDeps = defaultDeps,
) {
  return {
    /**
     * @param topicSlug the topic the verdict is about. If it is not the learner's
     * current topic (e.g. a guest interview, or a stale one) the verdict is not
     * applied to the live path.
     */
    async applyEvaluationVerdict(
      actor: DbActor,
      input: { topicSlug: string; verdict: InterviewVerdict },
    ): Promise<MasteryProgressionResult> {
      const profile = await deps.profileRepository.getCurrentProfile(actor);

      if (profile === null || profile.currentTopicSlug === null) {
        return { status: 'no_active_topic' };
      }

      if (profile.currentTopicSlug !== input.topicSlug) {
        return { status: 'topic_mismatch' };
      }

      const topicSlug = profile.currentTopicSlug;
      const curriculum = await deps.curriculumRepository.getActiveCurriculum(
        actor,
        topicSlug,
      );

      if (curriculum === null) {
        return { status: 'no_curriculum' };
      }

      const roadmap = layer1RoadmapSchema.parse(curriculum.layer1Roadmap);
      const depth = roadmap.requiredDepth;
      const sessions = curriculum.layer2Sessions.map((session) =>
        curriculumSessionSchema.parse(session),
      );
      const summary = readProgression(profile.stableMasterySummary);

      // Mastery reached: the path is complete on demonstrated understanding, not
      // on running out of planned days. Clear the evaluation gate so nothing is
      // scheduled behind it.
      if (meetsMasteryBar(input.verdict, depth)) {
        await deps.profileRepository.upsertProfile(actor, {
          stableMasterySummary: {
            ...profile.stableMasterySummary,
            progression: { ...summary, goalMastered: true },
          },
          nextEvaluationDueAt: null,
          lastActiveAt: new Date(),
        });

        return { status: 'mastered' };
      }

      // Below the bar: grow the path to close the cited gaps.
      const extension = extendCurriculumFromGaps({
        existingSessions: sessions,
        gaps: input.verdict.gaps,
        masterySummary: summary,
        topic: {
          title: roadmap.title,
          goal: roadmap.goal,
          topicSlug,
          requiredDepth: depth,
        },
      });

      if (extension.newSessions.length === 0) {
        // Everything is capped: persist the round state and stop rather than loop.
        await deps.profileRepository.upsertProfile(actor, {
          stableMasterySummary: {
            ...profile.stableMasterySummary,
            progression: extension.masterySummary,
          },
          lastActiveAt: new Date(),
        });

        appLogger.info('mastery_progression.capped', { topicSlug });

        return { status: 'capped' };
      }

      const firstNew = extension.newSessions[0]!;

      await deps.curriculumRepository.appendSessionsAndSetPointer(actor, topicSlug, {
        expectedRevision: curriculum.revision,
        newSessions: extension.newSessions,
        currentSessionId: firstNew.id,
        // The first appended session sits right after the existing ones.
        currentSessionIndex: sessions.length,
      });

      await deps.profileRepository.upsertProfile(actor, {
        stableMasterySummary: {
          ...profile.stableMasterySummary,
          progression: extension.masterySummary,
        },
        // Reopen the teaching loop so the new sessions get lessons.
        nextEvaluationDueAt: null,
        lastActiveAt: new Date(),
      });

      appLogger.info('mastery_progression.extended', {
        topicSlug,
        added: extension.newSessions.length,
        capped: extension.capped,
      });

      return {
        status: 'extended',
        added: extension.newSessions.length,
        reinforcedConcepts: extension.reinforcedConcepts,
        capped: extension.capped,
      };
    },
  };
}

export const masteryProgressionService = createMasteryProgressionService();
