# LRNR - Frontend Plan
> **Future implementation plan for the private LRNR web experience.**
> LRNR is personal-first: only the owner should access the app.

---

## Purpose

Telegram is useful for reminders and lightweight delivery, but LRNR needs a richer frontend for the full learning experience.

The frontend should be **top-notch**: polished, calm, fast, visually rich, and serious enough for deep technical study. This should not feel like a generic admin dashboard. It should feel like a private AI university cockpit built for one focused learner.

A frontend can show:

- diagrams
- flowcharts
- code blocks
- source links
- progress maps
- prerequisite graphs
- answer boxes
- review questions
- notes
- curriculum timeline
- mastery state
- Graph RAG explanations later
- ElevenLabs voice experience for spoken questions, explanations, and voice answers

Telegram remains useful for:

- reminders
- daily digest notifications
- learning alerts
- evaluation reminders
- lightweight status updates
- links back to the exact frontend page

The frontend should become the main learning cockpit.

---

## Frontend Page Count

Initial frontend scope should contain **14 main pages**.

These are not all equally complex, but each page has a distinct product job.

| # | Page | Purpose | Slice |
|---:|---|---|---|
| 1 | Private Login | Owner-only access gate | Slice 1 |
| 2 | Learning Dashboard | Daily command center | Slice 1 |
| 3 | Daily Lesson | Main study experience | Slice 1 |
| 4 | Lesson Review | Review questions, answer guide, recap | Slice 1 |
| 5 | Evaluation | Spoken/written evaluation flow | Slice 2 |
| 6 | Curriculum Map | Roadmap, sessions, prerequisites | Slice 1/Slice 2 |
| 7 | Concept Detail | One concept, prerequisites, mastery, sources | Slice 2 |
| 8 | Notes and Answers | Personal notes and submitted answers | Slice 2 |
| 9 | Mastery Dashboard | Strengths, weak concepts, decay, next probes | Slice 2 |
| 10 | Knowledge and Sources | Source-backed topic knowledge explorer | Slice 3 |
| 11 | News Digest | AI digest and curriculum connections | Slice 3 |
| 12 | Alerts and Notifications | Telegram alerts, system notices, reminders | Slice 1 |
| 13 | Settings | Owner profile, voice, notification, privacy settings | Slice 1 |
| 14 | System Status | Workflows, queue, RAG health, provider status | Slice 3 |

Minimum Slice 1 frontend can start with **6 pages**:

- Private Login
- Learning Dashboard
- Daily Lesson
- Lesson Review
- Curriculum Map
- Settings

Full LRNR frontend target is **14 pages**.

---

## Core Principle

The frontend is not the system brain.

The frontend should display, collect, and guide.

The backend should own:

- authentication checks
- agent execution
- RAG retrieval
- database writes
- LLM calls
- embeddings
- queue processing
- Graph RAG later
- service-role access

Clean split:

```text
Frontend
  -> Backend API
    -> Auth and owner check
    -> Agents / LangGraph
    -> RAG / Graph RAG
    -> Supabase PostgreSQL + pgvector
    -> Redis cache
    -> LLM providers
```

---

## Access Rule

LRNR is being built for personal use.

Only the owner should access the app.

Rules:

- no public signup
- no public onboarding
- no shared learner accounts
- no multi-user dashboard
- no anonymous access
- no public lesson pages

The frontend should assume:

```text
one authenticated owner
one private learning system
one protected workspace
```

---

## Recommended Frontend Stack

Recommended:

```text
Next.js
React
TypeScript
Tailwind CSS or a small design system
Auth.js / NextAuth client
Markdown/code rendering
Mermaid or diagram rendering
```

Core UX additions:

```text
ElevenLabs audio playback for voice explanations
Microphone answer capture for voice replies
Transcript review before submission
```

Optional later:

```text
React Flow for prerequisite graphs
shadcn/ui for components
Monaco editor for code answer boxes
Framer Motion for polished transitions
```

Do not add heavy UI libraries before the core learning flow is usable.

---

## UI Quality Bar

The UI should be top-tier because LRNR is meant for daily use. If the interface feels boring, cluttered, or generic, the learner will not want to return.

Design principles:

- calm premium visual style
- excellent typography
- generous spacing
- strong dark/light readability
- beautiful code blocks
- clean diagrams and graph views
- smooth but minimal motion
- one primary action per screen
- no admin-dashboard clutter
- no walls of undifferentiated text
- every page should answer "what should I do next?"

Visual direction:

```text
Private learning cockpit
Not SaaS admin panel
Not chatbot clone
Not course website
```

The interface should feel like:

- a personal research lab
- a technical notebook
- a curriculum map
- an AI mentor console
- a calm study room

## UI Components Needed

Core components:

- `AppShell`
- `SidebarNavigation`
- `TopStatusBar`
- `LessonCard`
- `MentalModelCallout`
- `VoiceQuestionPlayer`
- `VoiceAnswerRecorder`
- `TranscriptReviewBox`
- `CodeBlock`
- `DiagramPanel`
- `SourceCitationCard`
- `ReviewQuestionCard`
- `MasteryBadge`
- `ConceptGraph`
- `CurriculumTimeline`
- `Layer3Alert`
- `EvaluationPrompt`
- `ProgressRing`
- `NotificationToast`
- `SystemHealthCard`

These should be reusable and strongly typed.

---

## Main Screens

## 1. Private Login

Purpose:

- authenticate the owner
- reject everyone else
- require the private LRNR access secret

Behavior:

- login with approved email/provider
- backend verifies owner identity
- user enters LRNR access secret
- backend verifies secret hash
- unauthorized users see no app data

Login should have two gates:

```text
Gate 1: Auth.js / NextAuth provider login
Gate 2: private LRNR access secret
```

This is intentional because the app is for one person only.

## 2. Learning Dashboard

Shows:

- current topic
- current session
- next lesson
- evaluation due status
- progress through topic
- active weak concepts
- recent notes
- live updates waiting in Layer 3

UI expectation:

- should feel like the home base
- show today's learning action clearly
- show progress without overwhelming
- include a "Continue learning" primary button
- show Telegram alert status if a reminder was sent
- show next evaluation date

## 3. Daily Lesson Page

Shows:

- session header
- mental model
- explanation
- diagrams
- code blocks
- source links
- Layer 3 context
- review questions
- answer input area
- "mark understood" or "ask follow-up" actions

UI expectation:

- this is the most important page
- diagrams and code must render beautifully
- mental model should be visually prominent
- answer/review area should be easy to use
- voice explanation button should be available where useful
- sources should be visible but not noisy

## 4. Lesson Review Page

Shows:

- chapter/session recap
- key terms in plain English
- mental model
- review questions
- answer guide
- answer input
- saved answers
- "compare with expected points" after submission

Purpose:

- make review questions actually usable
- encourage active recall
- let the owner write answers after studying
- store answers for future Evaluation and RAG

UI expectation:

- should feel encouraging, not exam-like
- each question should have optional hints
- answer guide should be available without fully spoiling the answer
- after answer submission, show missing points gently

## 5. Evaluation Page

Shows:

- one question at a time
- answer box
- optional code answer editor
- follow-up prompts
- evaluation result summary
- detected gaps
- remediation plan
- optional audio explanation for the current question
- optional audio replay of feedback after the answer
- microphone button for spoken answers
- transcript preview before submitting spoken answers

Evaluation should feel conversational, not like a school form.

### Voice UX for evaluation - included in this version

ElevenLabs should be integrated as a feature of the frontend evaluation experience.

Use cases:

- read the current evaluation question aloud
- explain why the question is being asked
- rephrase a question from a different angle
- give a short encouragement before the next question
- read feedback after the answer is submitted
- turn a difficult concept into a spoken mental model
- allow the owner to answer by speaking instead of typing

Important rule:

```text
Text is the source of truth.
Audio is a UX layer.
Transcript is what gets saved and evaluated.
```

The page should always show the exact written question and feedback. Audio should never be the only place where important information exists.

### Voice answer flow

```text
Owner clicks "Answer by voice"
  -> frontend records audio
  -> backend verifies owner
  -> backend transcribes audio
  -> frontend shows transcript
  -> owner edits or confirms transcript
  -> backend submits transcript to Evaluation Agent
  -> Evaluation Agent scores the text answer
  -> optional ElevenLabs feedback audio is generated
```

The owner must be able to correct the transcript before final submission. A bad transcription should not become false evidence about understanding.

## 6. Curriculum Map

Shows:

- Layer 1 roadmap
- Layer 2 sessions
- Layer 3 live items
- concept dependencies
- prerequisites
- completed sessions
- upcoming sessions
- protected N+2 window

Later, this can become the visual entry point for Graph RAG.

UI expectation:

- roadmap should be visual, not just a list
- prerequisite edges should be visible
- blocked concepts should be obvious
- N+2 protected sessions should be marked
- mastered/weak concepts should have clear status

## 7. Concept Detail Page

Shows:

- concept explanation
- prerequisites
- dependent concepts
- mastery status
- related sessions
- active misconceptions
- source-backed claims
- related RAG memories
- Graph RAG path later

Purpose:

- let the owner zoom into one concept
- understand why it matters
- see what must be learned before/after it

## 8. Notes and Answers

Shows:

- user's written answers
- voice-answer transcripts
- saved notes
- corrections
- active misconceptions
- mastered concepts
- review history

This should help the owner study and reflect.

## 9. Mastery Dashboard

Shows:

- concept mastery by solve/explain/decide
- weak concepts
- confidence decay
- next evaluation targets
- recent improvements
- unresolved misconceptions
- remediation status

Purpose:

- make progress visible
- show where to focus next
- turn evaluation data into motivation

## 10. Knowledge / Sources Page

Shows:

- topic knowledge base
- source inventory
- important claims
- contradiction notes
- version notes
- source trust tiers

The goal is transparency: the learner can see where important claims came from.

## 11. News Digest Page

Shows:

- today's AI digest
- relevance score
- what changed
- why it matters
- whether to care now/later
- related curriculum concept
- Layer 3 routing decision

## 12. Alerts and Notifications Page

Shows:

- Telegram notification history
- lesson-ready alerts
- evaluation reminders
- workflow failure alerts
- queue/dead-letter alerts
- notification preferences

## 13. Settings Page

Shows:

- owner profile
- voice settings
- ElevenLabs voice selection
- notification timing
- Telegram connection
- privacy controls
- data export/delete options

## 14. System Status Page

Shows:

- daily learning workflow status
- daily research workflow status
- nightly reconciliation status
- queue depth
- Redis health
- Supabase health
- RAG retrieval health
- LLM provider status
- ElevenLabs status

Purpose:

- make the private system debuggable
- help the owner see when something failed
- avoid silent broken automation


---

## What The Frontend Must NOT Do

The frontend must not:

- call LLM providers directly
- call embedding providers directly
- use Supabase service-role keys
- mutate curriculum state directly
- write RAG memory directly
- process queues directly
- trust client-side authorization alone
- expose private source data publicly

The frontend sends requests. The backend decides what is allowed.

---

## Frontend Data Flow

Example daily lesson flow:

```text
Owner opens dashboard
  -> frontend requests current session
  -> backend verifies auth and owner ID
  -> backend loads curriculum/session/RAG context
  -> backend returns safe lesson payload
  -> frontend renders lesson, diagrams, code, and answer box
```

Example answer flow:

```text
Owner submits answer
  -> frontend posts answer
  -> backend verifies auth and owner ID
  -> backend stores answer
  -> Evaluation Agent may run
  -> backend returns next prompt or result
```

---

## Frontend UX Principles

- Make learning feel calm and focused.
- Show diagrams and code beautifully.
- Avoid walls of text.
- Keep one primary action visible.
- Make progress obvious.
- Make weak concepts visible but not discouraging.
- Show why the system chose the next lesson.
- Keep review questions answerable with guidance.
- Use mental models as motivation anchors.

---

## Frontend Build Order

## Slice 1 Frontend

Build:

- private login
- dashboard
- daily lesson page
- code/markdown rendering
- basic curriculum progress
- answer input

Do not build yet:

- complex graph visualization
- admin dashboards
- public landing pages
- payment pages

## Slice 2 Frontend

Build:

- evaluation page
- mastery view
- weak concept view
- remediation visibility
- notes and answer history
- ElevenLabs voice playback for evaluation prompts and feedback
- voice answer recording
- transcript review and edit before submission

## Slice 3 Frontend

Build:

- source/claim explorer
- Layer 3 live update UI
- digest UI
- prerequisite graph visualization
- Graph RAG explanation paths

---

## Final Rule

The frontend should make LRNR easier to understand and use.

It should not move secret logic, agent execution, or data authority into the browser.

Frontend = learning cockpit.

Backend = secure brain.

Telegram = notification and alert channel.
