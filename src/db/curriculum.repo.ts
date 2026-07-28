import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import {
  assertDbActor,
  buildUpdatedAtPatch,
  type CurriculumSessionDocument,
  curriculumSessionDocumentSchema,
  type DbActor,
  getOneOrNull,
  jsonArraySchema,
  jsonObjectSchema,
  requireMutationRow,
  requireRow,
  sessionStatusSchema,
  topicStatusSchema,
} from '@/db/repository-helpers';
import { curriculumState } from '@/db/schema';
import { AppError } from '@/server/errors';
import type { CurriculumStateRow } from '@/db/types';

const curriculumStateRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  topicBriefId: z.string().uuid().nullable(),
  topicSlug: z.string(),
  status: topicStatusSchema,
  layer1Roadmap: jsonObjectSchema,
  layer2Sessions: jsonArraySchema,
  layer3LiveQueue: jsonArraySchema,
  currentSessionId: z.string().nullable(),
  currentSessionIndex: z.number().int(),
  revision: z.number().int(),
  lastDeliveredAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const upsertCurriculumStateInputSchema = z.object({
  topicBriefId: z.string().uuid().nullable().optional(),
  topicSlug: z.string().trim().min(1).max(255),
  status: topicStatusSchema.default('active'),
  layer1Roadmap: jsonObjectSchema.default({}),
  layer2Sessions: z.array(curriculumSessionDocumentSchema).default([]),
  layer3LiveQueue: jsonArraySchema.default([]),
  currentSessionId: z.string().trim().min(1).nullable().optional(),
  currentSessionIndex: z.number().int().min(0).default(0),
  revision: z.number().int().positive().default(1),
  lastDeliveredAt: z.date().nullable().optional(),
});

const sessionStatusUpdateSchema = z.object({
  sessionId: z.string().trim().min(1),
  status: sessionStatusSchema,
  deliveredAt: z.date().nullable().optional(),
});

const lessonSaveSchema = z.object({
  sessionId: z.string().trim().min(1),
  lesson: jsonObjectSchema,
  expectedRevision: z.number().int().positive().optional(),
});

const currentSessionPointerSchema = z.object({
  sessionId: z.string().trim().min(1),
  sessionIndex: z.number().int().min(0),
});
const lessonCompletionUpdateSchema = z.object({
  sessionId: z.string().trim().min(1),
  expectedRevision: z.number().int().positive(),
  nextSessionId: z.string().trim().min(1).nullable(),
  nextSessionIndex: z.number().int().min(0),
});

const appendSessionsSchema = z.object({
  expectedRevision: z.number().int().positive(),
  newSessions: z.array(curriculumSessionDocumentSchema).min(1),
  currentSessionId: z.string().trim().min(1),
  currentSessionIndex: z.number().int().min(0),
});

export type CurriculumStateRecord = z.infer<typeof curriculumStateRecordSchema>;
export type UpsertCurriculumStateInput = z.infer<
  typeof upsertCurriculumStateInputSchema
>;

function parseCurriculumRow(row: CurriculumStateRow): CurriculumStateRecord {
  return curriculumStateRecordSchema.parse(row);
}

function parseSessionDocuments(
  sessions: unknown[],
): CurriculumSessionDocument[] {
  return sessions.map((session) => curriculumSessionDocumentSchema.parse(session));
}

export function applySessionStatusUpdate(
  sessions: CurriculumSessionDocument[],
  input: z.infer<typeof sessionStatusUpdateSchema>,
): CurriculumSessionDocument[] {
  let didUpdate = false;
  const updatedSessions = sessions.map((session) => {
    if (session.id !== input.sessionId) {
      return session;
    }

    didUpdate = true;

    return {
      ...session,
      status: input.status,
      ...(input.deliveredAt === undefined
        ? {}
        : { deliveredAt: input.deliveredAt?.toISOString() ?? null }),
    };
  });

  if (!didUpdate) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: `Curriculum session ${input.sessionId} was not found.`,
      status: 404,
    });
  }

  return updatedSessions;
}

export function applyLessonToSession(
  sessions: CurriculumSessionDocument[],
  input: z.infer<typeof lessonSaveSchema>,
): CurriculumSessionDocument[] {
  let didUpdate = false;
  const updatedSessions = sessions.map((session) => {
    if (session.id !== input.sessionId) {
      return session;
    }

    didUpdate = true;

    return {
      ...session,
      status: 'ready' as const,
      lesson: input.lesson,
    };
  });

  if (!didUpdate) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: `Curriculum session ${input.sessionId} was not found.`,
      status: 404,
    });
  }

  return updatedSessions;
}

/**
 * Curriculum repository keeps Layer 2 edits explicit. Session metadata is
 * stored inside the validated JSON array so later agents do not patch anonymous
 * blobs from random services.
 */

export interface LessonCompletionPatchInput {
  sessions: CurriculumSessionDocument[];
  sessionId: string;
  nextSessionId: string | null;
  nextSessionIndex: number;
}

export interface LessonCompletionPatch {
  layer2Sessions: CurriculumSessionDocument[];
  currentSessionId: string | null;
  currentSessionIndex: number;
}

export function buildLessonCompletionPatch(
  input: LessonCompletionPatchInput,
): LessonCompletionPatch {
  return {
    layer2Sessions: applySessionStatusUpdate(input.sessions, {
      sessionId: input.sessionId,
      status: 'completed',
    }),
    currentSessionId: input.nextSessionId,
    currentSessionIndex: input.nextSessionIndex,
  };
}

const currentLessonReadRowSchema = z.object({
  topicSlug: z.string().nullable(),
  revision: z.number().int().nullable(),
  currentSessionId: z.string().nullable(),
  currentSessionIndex: z.number().int().nullable(),
  currentSession: z.unknown().nullable(),
});

const curriculumMapReadRowSchema = z.object({
  topicSlug: z.string().nullable(),
  revision: z.number().int().nullable(),
  currentSessionId: z.string().nullable(),
  layer1Roadmap: z.unknown().nullable(),
  sessions: z.array(z.unknown()),
});

export type CurrentLessonReadRow = z.infer<typeof currentLessonReadRowSchema>;
export type CurriculumMapReadRow = z.infer<typeof curriculumMapReadRowSchema>;
export function createCurriculumRepository(database: DbClient = db) {
  return {
    async getCurrentLessonReadModel(
      actor: DbActor,
    ): Promise<CurrentLessonReadRow> {
      const validatedActor = assertDbActor(actor);
      const rows = await database.execute(sql`
        select
          p.current_topic_slug as "topicSlug",
          c.revision as "revision",
          c.current_session_id as "currentSessionId",
          c.current_session_index as "currentSessionIndex",
          case
            when c.current_session_id is null then null
            else c.layer_2_sessions -> c.current_session_index
          end as "currentSession"
        from user_profile p
        left join curriculum_state c
          on c.user_id = p.user_id
          and c.topic_slug = p.current_topic_slug
        where p.user_id = ${validatedActor.userId}
        limit 1
      `);
      const row = getOneOrNull(rows as unknown as Record<string, unknown>[]);

      return currentLessonReadRowSchema.parse(
        row ?? {
          topicSlug: null,
          revision: null,
          currentSessionId: null,
          currentSessionIndex: null,
          currentSession: null,
        },
      );
    },

    async getCurriculumMapReadModel(
      actor: DbActor,
    ): Promise<CurriculumMapReadRow> {
      const validatedActor = assertDbActor(actor);
      const rows = await database.execute(sql`
        select
          p.current_topic_slug as "topicSlug",
          c.revision as "revision",
          c.current_session_id as "currentSessionId",
          c.layer_1_roadmap as "layer1Roadmap",
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', session_item->>'id',
                'title', session_item->>'title',
                'status', session_item->>'status',
                'phase', session_item->>'phase',
                'conceptsToCover', coalesce(session_item->'conceptsToCover', '[]'::jsonb)
              )
              order by ordinal
            )
            from jsonb_array_elements(c.layer_2_sessions) with ordinality as items(session_item, ordinal)
          ), '[]'::jsonb) as "sessions"
        from user_profile p
        left join curriculum_state c
          on c.user_id = p.user_id
          and c.topic_slug = p.current_topic_slug
        where p.user_id = ${validatedActor.userId}
        limit 1
      `);
      const row = getOneOrNull(rows as unknown as Record<string, unknown>[]);

      return curriculumMapReadRowSchema.parse(
        row ?? {
          topicSlug: null,
          revision: null,
          currentSessionId: null,
          layer1Roadmap: null,
          sessions: [],
        },
      );
    },
    async createCurriculum(
      actor: DbActor,
      input: UpsertCurriculumStateInput,
    ): Promise<CurriculumStateRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = upsertCurriculumStateInputSchema.parse(input);
      const [row] = await database
        .insert(curriculumState)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
          layer2Sessions: validatedInput.layer2Sessions,
        })
        .onConflictDoUpdate({
          target: [curriculumState.userId, curriculumState.topicSlug],
          set: {
            ...validatedInput,
            layer2Sessions: validatedInput.layer2Sessions,
            ...buildUpdatedAtPatch(),
          },
        })
        .returning();

      return parseCurriculumRow(
        requireMutationRow(row, 'Curriculum write did not return a row.'),
      );
    },

    async getActiveCurriculum(
      actor: DbActor,
      topicSlug: string,
    ): Promise<CurriculumStateRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validatedTopicSlug = z.string().trim().min(1).parse(topicSlug);
      const rows = await database
        .select()
        .from(curriculumState)
        .where(
          and(
            eq(curriculumState.userId, validatedActor.userId),
            eq(curriculumState.topicSlug, validatedTopicSlug),
          ),
        )
        .limit(1);

      const row = getOneOrNull(rows);

      return row === null ? null : parseCurriculumRow(row);
    },

    async updateSessionStatus(
      actor: DbActor,
      topicSlug: string,
      input: z.infer<typeof sessionStatusUpdateSchema>,
    ): Promise<CurriculumStateRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedTopicSlug = z.string().trim().min(1).parse(topicSlug);
      const validatedInput = sessionStatusUpdateSchema.parse(input);
      const currentState = requireRow(
        await this.getActiveCurriculum(validatedActor, validatedTopicSlug),
        'Active curriculum not found for the current topic.',
        { topicSlug: validatedTopicSlug },
      );
      const parsedSessions = parseSessionDocuments(currentState.layer2Sessions);
      const updatedSessions = applySessionStatusUpdate(parsedSessions, validatedInput);
      const [row] = await database
        .update(curriculumState)
        .set({
          layer2Sessions: updatedSessions,
          revision: currentState.revision + 1,
          ...(validatedInput.deliveredAt === undefined
            ? {}
            : { lastDeliveredAt: validatedInput.deliveredAt ?? null }),
          ...buildUpdatedAtPatch(),
        })
        .where(eq(curriculumState.id, currentState.id))
        .returning();

      return parseCurriculumRow(
        requireMutationRow(row, 'Curriculum update did not return a row.'),
      );
    },

    async saveGeneratedLesson(
      actor: DbActor,
      topicSlug: string,
      input: z.infer<typeof lessonSaveSchema>,
    ): Promise<CurriculumStateRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedTopicSlug = z.string().trim().min(1).parse(topicSlug);
      const validatedInput = lessonSaveSchema.parse(input);
      const currentState = requireRow(
        await this.getActiveCurriculum(validatedActor, validatedTopicSlug),
        'Active curriculum not found for the current topic.',
        { topicSlug: validatedTopicSlug },
      );
      const parsedSessions = parseSessionDocuments(currentState.layer2Sessions);
      const updatedSessions = applyLessonToSession(parsedSessions, validatedInput);
      const [row] = await database
        .update(curriculumState)
        .set({
          layer2Sessions: updatedSessions,
          revision: currentState.revision + 1,
          ...buildUpdatedAtPatch(),
        })
        .where(
          validatedInput.expectedRevision === undefined
            ? eq(curriculumState.id, currentState.id)
            : and(
                eq(curriculumState.id, currentState.id),
                eq(curriculumState.userId, validatedActor.userId),
                eq(curriculumState.revision, validatedInput.expectedRevision),
              ),
        )
        .returning();

      if (row === undefined && validatedInput.expectedRevision !== undefined) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Curriculum revision conflict while saving generated lesson.',
          status: 409,
          details: { expectedRevision: validatedInput.expectedRevision },
        });
      }

      return parseCurriculumRow(
        requireMutationRow(row, 'Curriculum lesson update did not return a row.'),
      );
    },

    async completeSessionAndAdvancePointer(
      actor: DbActor,
      topicSlug: string,
      input: z.infer<typeof lessonCompletionUpdateSchema>,
    ): Promise<CurriculumStateRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedTopicSlug = z.string().trim().min(1).parse(topicSlug);
      const validatedInput = lessonCompletionUpdateSchema.parse(input);
      const currentState = requireRow(
        await this.getActiveCurriculum(validatedActor, validatedTopicSlug),
        'Active curriculum not found for the current topic.',
        { topicSlug: validatedTopicSlug },
      );

      if (currentState.revision !== validatedInput.expectedRevision) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Curriculum changed before lesson completion could be saved.',
          status: 409,
          details: {
            expectedRevision: validatedInput.expectedRevision,
            actualRevision: currentState.revision,
          },
        });
      }

      const parsedSessions = parseSessionDocuments(currentState.layer2Sessions);
      const completionPatch = buildLessonCompletionPatch({
        sessions: parsedSessions,
        sessionId: validatedInput.sessionId,
        nextSessionId: validatedInput.nextSessionId,
        nextSessionIndex: validatedInput.nextSessionIndex,
      });
      const [row] = await database
        .update(curriculumState)
        .set({
          layer2Sessions: completionPatch.layer2Sessions,
          currentSessionId: completionPatch.currentSessionId,
          currentSessionIndex: completionPatch.currentSessionIndex,
          revision: currentState.revision + 1,
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(curriculumState.id, currentState.id),
            eq(curriculumState.userId, validatedActor.userId),
            eq(curriculumState.revision, validatedInput.expectedRevision),
          ),
        )
        .returning();

      if (row === undefined) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Curriculum revision conflict while completing lesson.',
          status: 409,
          details: {
            expectedRevision: validatedInput.expectedRevision,
          },
        });
      }

      return parseCurriculumRow(row);
    },
    /**
     * Appends reinforcement sessions to the live path and moves the pointer to
     * the first of them, under optimistic revision control. This is the "keep
     * going until mastery" write: the plan grows to close evaluated gaps instead
     * of ending at the last planned session.
     */
    async appendSessionsAndSetPointer(
      actor: DbActor,
      topicSlug: string,
      input: z.infer<typeof appendSessionsSchema>,
    ): Promise<CurriculumStateRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedTopicSlug = z.string().trim().min(1).parse(topicSlug);
      const validatedInput = appendSessionsSchema.parse(input);
      const currentState = requireRow(
        await this.getActiveCurriculum(validatedActor, validatedTopicSlug),
        'Active curriculum not found for the current topic.',
        { topicSlug: validatedTopicSlug },
      );

      if (currentState.revision !== validatedInput.expectedRevision) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Curriculum changed before reinforcement sessions could be added.',
          status: 409,
          details: {
            expectedRevision: validatedInput.expectedRevision,
            actualRevision: currentState.revision,
          },
        });
      }

      const parsedSessions = parseSessionDocuments(currentState.layer2Sessions);
      const nextSessions = [...parsedSessions, ...validatedInput.newSessions];
      const [row] = await database
        .update(curriculumState)
        .set({
          layer2Sessions: nextSessions,
          currentSessionId: validatedInput.currentSessionId,
          currentSessionIndex: validatedInput.currentSessionIndex,
          revision: currentState.revision + 1,
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(curriculumState.id, currentState.id),
            eq(curriculumState.userId, validatedActor.userId),
            eq(curriculumState.revision, validatedInput.expectedRevision),
          ),
        )
        .returning();

      if (row === undefined) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Curriculum revision conflict while adding reinforcement sessions.',
          status: 409,
          details: { expectedRevision: validatedInput.expectedRevision },
        });
      }

      return parseCurriculumRow(row);
    },

    async updateCurrentSessionPointer(
      actor: DbActor,
      topicSlug: string,
      input: z.infer<typeof currentSessionPointerSchema>,
    ): Promise<CurriculumStateRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedTopicSlug = z.string().trim().min(1).parse(topicSlug);
      const validatedInput = currentSessionPointerSchema.parse(input);
      const [row] = await database
        .update(curriculumState)
        .set({
          currentSessionId: validatedInput.sessionId,
          currentSessionIndex: validatedInput.sessionIndex,
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(curriculumState.userId, validatedActor.userId),
            eq(curriculumState.topicSlug, validatedTopicSlug),
          ),
        )
        .returning();

      return parseCurriculumRow(
        requireMutationRow(
          row,
          'Active curriculum not found for the current topic.',
          { topicSlug: validatedTopicSlug },
        ),
      );
    },
  };
}

export const curriculumRepository = createCurriculumRepository();
