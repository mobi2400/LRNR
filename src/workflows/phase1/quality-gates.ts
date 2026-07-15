import { z } from 'zod';

import { lessonPayloadSchema } from '@/schemas/lesson.schema';
import { topicKnowledgeDocumentSchema } from '@/schemas/knowledge.schema';
import { curriculumSessionSchema, layer1RoadmapSchema } from '@/schemas/curriculum.schema';
import { onboardingTopicBlueprintSchema } from '@/schemas/onboarding.schema';

export const qualityGateIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(['warning', 'blocking']),
});

export const qualityGateResultSchema = z.object({
  passed: z.boolean(),
  issues: z.array(qualityGateIssueSchema),
});

export type QualityGateIssue = z.infer<typeof qualityGateIssueSchema>;
export type QualityGateResult = z.infer<typeof qualityGateResultSchema>;

function result(issues: QualityGateIssue[]): QualityGateResult {
  return qualityGateResultSchema.parse({
    passed: issues.every((issue) => issue.severity !== 'blocking'),
    issues,
  });
}

function blocking(code: string, message: string): QualityGateIssue {
  return { code, message, severity: 'blocking' };
}

function hasSpecificText(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return normalized.length >= 24 && !['todo', 'tbd', 'placeholder', 'lorem ipsum'].some((token) => normalized.includes(token));
}

export function gateArchitectOutput(output: unknown): QualityGateResult {
  const parsed = z.object({ topicBlueprint: onboardingTopicBlueprintSchema }).safeParse(output);

  if (!parsed.success) {
    return result([blocking('architect_schema_invalid', 'Architect output did not match the onboarding blueprint contract.')]);
  }

  const blueprint = parsed.data.topicBlueprint;
  const issues: QualityGateIssue[] = [];

  if (blueprint.conceptOutline.length < 2) {
    issues.push(blocking('architect_concepts_too_thin', 'Architect must identify at least two concepts for a usable Phase 1 path.'));
  }

  if (blueprint.prerequisiteMap.length === 0) {
    issues.push(blocking('architect_missing_prerequisites', 'Architect must include prerequisite signals instead of a generic topic shell.'));
  }

  return result(issues);
}

export function gateCartographerOutput(output: unknown): QualityGateResult {
  const parsed = z.object({ knowledgeDocument: topicKnowledgeDocumentSchema }).safeParse(output);

  if (!parsed.success) {
    return result([blocking('cartographer_schema_invalid', 'Cartographer output did not match the topic knowledge contract.')]);
  }

  const document = parsed.data.knowledgeDocument;
  const issues: QualityGateIssue[] = [];

  if (document.sourceInventory.length === 0 || document.conceptMap.some((concept) => concept.provenance.length === 0)) {
    issues.push(blocking('cartographer_missing_provenance', 'Every concept must remain tied to source provenance.'));
  }

  if (document.metadata.researchQuality === 'minimal' && document.limitations.length === 0) {
    issues.push(blocking('cartographer_missing_limitations', 'Minimal research quality must include limitations for downstream trust.'));
  }

  return result(issues);
}

export function gateCurriculumOutput(output: unknown): QualityGateResult {
  const parsed = z.object({ roadmap: layer1RoadmapSchema, sessions: z.array(curriculumSessionSchema).min(1) }).safeParse(output);

  if (!parsed.success) {
    return result([blocking('curriculum_schema_invalid', 'Curriculum output did not match roadmap/session contracts.')]);
  }

  const issues: QualityGateIssue[] = [];
  const coveredConcepts = new Set(parsed.data.sessions.flatMap((session) => session.conceptsToCover));

  if (coveredConcepts.size < Math.min(2, parsed.data.roadmap.milestones.length)) {
    issues.push(blocking('curriculum_concept_coverage_low', 'Curriculum sessions must cover the roadmap concepts, not only a single generic lesson.'));
  }

  if (parsed.data.sessions.filter((session) => session.status === 'ready').length !== 1) {
    issues.push(blocking('curriculum_ready_session_count', 'Exactly one Phase 1 session should be ready at a time.'));
  }

  return result(issues);
}

export function gateTeachingOutput(output: unknown): QualityGateResult {
  const parsed = z.object({ lesson: lessonPayloadSchema }).safeParse(output);

  if (!parsed.success) {
    return result([blocking('teaching_schema_invalid', 'Teaching output did not match the lesson contract.')]);
  }

  const lesson = parsed.data.lesson;
  const issues: QualityGateIssue[] = [];

  if (!hasSpecificText(lesson.mentalModel) || lesson.explanation.some((section) => !hasSpecificText(section.body))) {
    issues.push(blocking('teaching_explanation_too_generic', 'Lesson explanation must contain specific, non-placeholder teaching text.'));
  }

  if (lesson.sourceReferences.length === 0) {
    issues.push(blocking('teaching_missing_sources', 'Lesson must carry source references for learner trust and follow-up grounding.'));
  }

  if (lesson.reviewQuestions.length < 1) {
    issues.push(blocking('teaching_missing_review', 'Lesson must include at least one review question.'));
  }

  return result(issues);
}
