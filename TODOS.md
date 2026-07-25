# TODOS

Deferred work with enough context to pick up cold. Added by `/plan-eng-review`.

---

## Migrate onboarding onto the shared turn-sequencer

**Status:** deferred to week 3 of the evaluation-agent build
**Added:** 2026-07-25

**What:** Move `createInitialOnboardingState` / `applyOnboardingAnswer` in
`src/agents/architect/architect-agent.ts` (around lines 654-742) onto the shared
turn-sequencer built for the interview loop.

**Why:** The eng review chose to extract the sequencer for the interview only and
leave onboarding on its own turn-loop code, to keep a refactor of working,
shipped code off the critical path of week 1. That decision deliberately creates
two implementations of the same sequencing. This TODO exists so the duplicate
stays a decision rather than quietly becoming permanent.

**Pros:** Removes the duplicate. Validates the abstraction against a second real
consumer, which is the only way to find out whether it was shaped correctly.

**Cons:** Touches a working agent. The sequencer was designed against a single
consumer (the interview), so this is not a mechanical move — expect to reshape it.

**Context:** The sequencer owns turn ordering, the turn cap, status transitions,
and transcript accumulation. What stays agent-specific: onboarding's per-turn
behavior (mapping the learner) and its terminal synthesis (`generateBlueprint`);
the interview's per-turn behavior (judging) and its terminal synthesis (verdict).
`tests/onboarding/architect-agent.test.ts` is the regression gate — it must pass
unchanged. Note that suite drives the interview "through the injected model"
(line 62), which is the established testing seam.

**Depends on / blocked by:** The interview loop shipping and surviving contact
with real users, so the sequencer's shape has stopped moving. Do not attempt
before then.

---

## Capture interviewee reaction after the verdict (unattended sessions)

**Status:** deferred to week 3 of the evaluation-agent build
**Added:** 2026-07-25

**What:** Add a lightweight way to hear from an interviewee on the verdict screen
— a single "was any of this wrong?" line with an optional contact field.

**Why:** The design review chose to end the verdict screen with an offer of a
second interview rather than a feedback or contact ask. That is correct for
week 1, because the founder is sitting next to the interviewee and can simply
ask. Week 3 sends guest links to people nobody is sitting with. At that point
the last screen captures nothing: they finish, they close the tab, and there is
no way to learn whether the verdict was accurate.

**Pros:** Turns unattended sessions into evidence. The moment right after a blunt
verdict is when someone is most willing to say the judge got it wrong, which is
the single most valuable signal for calibrating the golden set (task T11).

**Cons:** Any capture on the payoff screen risks reading as a signup wall, which
is exactly the goodwill cost the week-1 decision avoided. Keep it to one line and
never block the second-interview action behind it.

**Context:** The verdict screen currently ends with "Want to be pressed on
replication?" plus a start action. Verdict logging (eng review task T8) already
stores every verdict server-side, so the model's output is recoverable without
asking. What is missing is the human's reaction to it, which no amount of
server-side logging can reconstruct.

**Depends on / blocked by:** Guest links going out unattended, which is week 3.
