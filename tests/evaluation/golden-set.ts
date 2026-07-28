/**
 * The judge golden set (T11).
 *
 * Each case is a real answer paired with the calibration property the judge must
 * satisfy. This is the data the calibration harness runs against the real model,
 * and the same shape the verdict log (T8) + interviewee reactions (T9) can be
 * distilled into as real sessions accumulate. Keep the assertions about
 * *properties* (found a gap / named the element / graded on knowledge), never
 * exact strings — the model's wording will vary; its judgment must not.
 */

export interface GoldenCase {
  id: string;
  topicSlug: string;
  probe: string;
  answer: string;
  expect: {
    /** The judge must record at least one gap finding. */
    mustFindGap?: boolean;
    /** If a gap is found, its text must mention one of these concepts. */
    mustMention?: string[];
    /** The judge must NOT record a gap for the concept under test. */
    gradeAsCorrect?: boolean;
    /**
     * Whether retrieval would return grounding evidence. 'empty' means the
     * judge must not fabricate a citation — it should leave the turn unscored
     * rather than grounding a gap against nothing.
     */
    ragEvidence?: 'present' | 'empty';
  };
  rationale: string;
}

export const JUDGE_GOLDEN_SET: GoldenCase[] = [
  {
    id: 'confident-wrong-consistent-hashing',
    topicSlug: 'system-design',
    probe: 'What is consistent hashing and why does it matter for load balancing?',
    answer:
      'Consistent hashing means the server hashes the password consistently ' +
      'so the same password always produces the same hash. This is important ' +
      'for load balancing because each server can verify passwords ' +
      'independently.',
    expect: { mustFindGap: true, ragEvidence: 'present' },
    rationale:
      'Confuses consistent hashing with password hashing — confidently wrong. ' +
      'If the judge praises this, the product has failed.',
  },
  {
    id: 'partial-read-replica',
    topicSlug: 'system-design',
    probe: 'When does adding a read replica stop helping?',
    answer:
      "I'd add a read replica because it's easier and it spreads the read " +
      'load across more machines.',
    expect: {
      mustFindGap: true,
      mustMention: ['replication lag', 'lag', 'consistency'],
      ragEvidence: 'present',
    },
    rationale:
      'Mentions replicas but never replication lag — the specific missing ' +
      'element the gap finding must name.',
  },
  {
    id: 'correct-hinglish-replication-lag',
    topicSlug: 'system-design',
    probe: 'Explain when a read replica gives you stale reads.',
    answer:
      'Replication lag tab hota hai jab write load zyada ho jaata hai. ' +
      'Read replica eventually consistent hota hai, toh agar lag badh gaya ' +
      'toh stale reads milenge. Signal yeh hai ki replica lag monitoring ' +
      'mein spike aaye aur application-level consistency guarantee break ho.',
    expect: { gradeAsCorrect: true, ragEvidence: 'present' },
    rationale:
      'Technically correct in mixed Hindi-English. Must be graded on ' +
      'knowledge, not English proficiency (design decision 11).',
  },
  {
    id: 'correct-english-replication-lag',
    topicSlug: 'system-design',
    probe: 'When does a read replica stop working?',
    answer:
      'A read replica stops working when replication lag exceeds the ' +
      "application's consistency requirements. The signal is replica lag " +
      'exceeding your SLA threshold under sustained write load.',
    expect: { gradeAsCorrect: true, ragEvidence: 'present' },
    rationale: 'A clearly correct answer — the judge must not invent a gap.',
  },
  {
    id: 'no-evidence-do-not-fabricate',
    topicSlug: 'system-design',
    probe: 'Describe the failure mode of your caching layer at 10x scale.',
    answer:
      'The cache would probably get overwhelmed and you would see some ' +
      'errors, so you would need to handle that somehow.',
    expect: { ragEvidence: 'empty' },
    rationale:
      'Vague answer AND no retrieval evidence. The judge must not fabricate a ' +
      'source URI to ground a gap — it should leave the turn unscored.',
  },
];
