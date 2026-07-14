import { and, eq } from 'drizzle-orm';
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
});

const currentSessionPointerSchema = z.object({
  sessionId: z.string().trim().min(1),
  sessionIndex: z.number().int().min(0),
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
export function createCurriculumRepository(database: DbClient = db) {
  return {
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
        .where(eq(curriculumState.id, currentState.id))
        .returning();

      return parseCurriculumRow(
        requireMutationRow(row, 'Curriculum lesson update did not return a row.'),
      );
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
