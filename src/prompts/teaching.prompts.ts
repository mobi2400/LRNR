import type { TopicKnowledgeBaseRecord } from '@/db/knowledge.repo';
import type { ProfileRecord } from '@/db/profile.repo';
import type { CurriculumSession } from '@/schemas/curriculum.schema';

export const teachingSystemPrompt = `You are LRNR's Teaching Agent.
Create a substantive lesson for one learner, not a curriculum outline.

Non-negotiable rules:
- Explain the problem first, then the concept, then concrete consequences and tradeoffs.
- Never expose planning instructions such as "define X", "plan step", or "close with a question" as lesson prose.
- Use only the supplied knowledge document for factual claims and source URLs.
- Do not fabricate companies, statistics, quotations, or source URLs.
- Internal LRNR topic briefs may ground personalization, but label them as internal context.
- Code must be relevant to the lesson concept. Omit code when it would be decorative.
- Mermaid must use a simple flowchart with short labels and no styling directives.
- Return one JSON object and no markdown fence.`;

function compactKnowledge(knowledgeBase: TopicKnowledgeBaseRecord) {
  return {
    sourceInventory: knowledgeBase.sourceInventory.slice(0, 8),
    conceptMap: knowledgeBase.conceptMap.slice(0, 12),
    claims: knowledgeBase.claims.slice(0, 12),
    limitations: knowledgeBase.limitations.slice(0, 8),
    codePatterns: knowledgeBase.codePatterns.slice(0, 6),
    interviewPatterns: knowledgeBase.interviewPatterns.slice(0, 6),
    metadata: knowledgeBase.metadata,
  };
}

export function buildGroundedLessonPrompt(input: {
  topicSlug: string;
  session: CurriculumSession;
  knowledgeBase: TopicKnowledgeBaseRecord;
  profile: ProfileRecord;
}): string {
  return `Create the complete first-pass lesson JSON described below.

LEARNER
Goal: ${input.profile.currentGoal ?? input.topicSlug}
Preferences: ${JSON.stringify(input.profile.learnerPreferences)}

SESSION CONTRACT
${JSON.stringify({
  title: input.session.title,
  phase: input.session.phase,
  conceptsToCover: input.session.conceptsToCover,
  masteryObjective: input.session.masteryObjective,
  prerequisites: input.session.prerequisites,
  connectionToPrior: input.session.connectionToPrior,
  tomorrowPreview: input.session.tomorrowPreview,
  reviewQuestions: input.session.reviewQuestions,
})}

VALIDATED KNOWLEDGE
${JSON.stringify(compactKnowledge(input.knowledgeBase))}

Return this exact JSON shape:
{
  "title": "specific learner-facing title",
  "objective": "what the learner will be able to explain or decide",
  "mentalModel": "a memorable 2-4 sentence model",
  "explanation": [
    { "heading": "Why this exists", "body": "substantive prose" },
    { "heading": "How it works", "body": "substantive prose" },
    { "heading": "Tradeoffs in practice", "body": "substantive prose" }
  ],
  "diagram": {
    "type": "mermaid",
    "content": "flowchart LR\\n  A[Short label] --> B[Short label]"
  },
  "codeExamples": [
    {
      "title": "relevant example",
      "language": "ts",
      "code": "valid concise code",
      "explanation": "why this code matters"
    }
  ],
  "commonMistakes": ["specific mistake", "specific mistake"],
  "reviewQuestions": [
    {
      "id": "review-1",
      "question": "reasoning question",
      "expectedPoints": ["point 1", "point 2"],
      "hint": "useful hint"
    }
  ],
  "sourceReferences": [
    { "label": "source inventory label", "url": "exact supplied URL", "kind": "external or internal" }
  ],
  "nextAction": "specific preview of the next session"
}

Quality threshold:
- At least three explanation sections, each useful as teaching prose rather than instructions.
- At least two common mistakes and two reasoning review questions.
- Cite only exact URLs from sourceInventory.
- Use "internal" for lrnr:// URLs and "external" for http/https URLs.
- Do not repeat generic LearningCheckpoint placeholder code.`;
}
