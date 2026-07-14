# LRNR - Delivery Telegram
> **Load alongside all 4 foundation files before coding Telegram delivery.**
> **Foundation files: 01_projectoverview.md, 02_architecture.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## System Identity

| Property | Value |
|----------|-------|
| Primary purpose | Notify the owner, send alerts, deliver lightweight digests, and deep-link back to the LRNR frontend |
| Main files to create | `src/lib/telegram.ts`, `src/types/telegram.types.ts`, `src/nodes/delivery.node.ts` |
| Delivery library | `telegraf` |
| Main flows | study reminders, lesson-ready alerts, evaluation reminders, digest notifications, system alerts |

---

## Updated Role

Telegram is no longer the primary learning surface.

The LRNR web frontend is the main study experience because it can show:

- diagrams
- code blocks
- answer boxes
- curriculum maps
- source links
- progress views
- Graph RAG explanations later

Telegram remains valuable as a notification and alert channel.

Its job is to bring the owner back to the frontend at the right moment.

```text
Telegram = notify, alert, remind, deep-link
Frontend = study, answer, review, explore
Backend = authenticate, retrieve, reason, persist
```

---

## What This System Does

Its job is to make the system feel:

- immediate
- consistent
- readable
- low-friction
- human

Telegram delivery is not full lesson rendering anymore. It is responsible for:

- sending concise reminders
- sending lesson-ready alerts
- sending evaluation-due alerts
- sending news digest summaries
- sending system failure or recovery alerts
- including safe links back to the frontend
- respecting Telegram limits
- avoiding duplicate notifications
- avoiding notification fatigue

---

## Delivery Philosophy

Telegram should feel like a thoughtful technical mentor, not a spam bot.

That means:

- messages must be broken into digestible chunks
- each message should have one clear purpose
- formatting should aid learning, not look decorative
- the owner should know why they are being notified
- the system should avoid overwhelming the user with too many items at once
- most messages should include a link back to the exact frontend page

---

## Main Delivery Modes

### 1. Study reminder

Daily reminder that a learning session is ready.

Characteristics:

- short
- calm
- includes current topic/session
- links to the lesson page

Example:

```text
Your LRNR session is ready.

Topic: RAG and Context Engineering
Today: Hybrid retrieval

Open lesson: {frontend_url}/lesson/current
```

### 2. Evaluation reminder

Reminder that evaluation is due.

Characteristics:

- direct
- not scary
- explains why evaluation matters
- links to evaluation page

### 3. News digest notification

Compact digest notification.

Characteristics:

- concise
- relevance-aware
- not overly long
- links to full digest page
- may include 1-3 headlines only

### 4. System alert

Operational notification for the owner.

Examples:

- daily learning workflow failed
- Telegram send failed
- queue item dead-lettered
- evaluation write failed
- source fetch failed repeatedly
- auth anomaly detected

### 5. Optional quick reply

Telegram may support simple quick replies later, but the frontend remains the main interaction surface.

Examples:

- remind me later
- mark notification read
- open today's lesson
- pause reminders today

---

## `src/lib/telegram.ts` Responsibilities

This file should be the main delivery wrapper.

Recommended responsibilities:

```ts
sendTelegramMessage(userId, text, options?)
sendTelegramMessages(userId, messages, options?)
safeSendMarkdown(userId, text)
splitTelegramMessage(text, maxLength?)
sendLessonReadyAlert(userId, session)
sendEvaluationDueAlert(userId, evaluation)
sendDigestAlert(userId, digestSummary)
sendSystemAlert(alert)
```

The rest of the codebase should not use raw Telegraf calls directly unless the wrapper intentionally exposes them.

---

## Notification Rules

Telegram notifications should be:

- short
- actionable
- owner-only
- idempotent
- linked to the frontend
- rate limited
- respectful of quiet hours if configured

Every notification should answer:

```text
Why am I getting this?
What should I do now?
Where do I click?
```

### Phase 1 duplicate-safety rule

Phase 1 worker-delivered Telegram alerts must fit in one Telegram send. The worker rejects oversized alert text instead of partially sending chunks, because chunk progress is not persisted yet and retrying a partially sent multi-chunk alert could duplicate user-visible messages.

The `splitTelegramMessage` helper remains available for future delivery modes, but Phase 1 lesson-ready and test alerts are concise frontend deep links rather than lesson content.

---

## Deep Link Rules

Most Telegram messages should include a frontend link.

Examples:

```text
{APP_URL}/lesson/current
{APP_URL}/evaluation/current
{APP_URL}/digest/today
{APP_URL}/curriculum
{APP_URL}/alerts
```

The backend must still authenticate and assert owner access when the link opens.

Telegram links do not replace auth.

---

## Telegraf Setup

### Preferred setup responsibilities

The Telegram service layer should own:

- bot initialization
- webhook or polling configuration
- update routing
- user-id extraction
- error logging
- duplicate update protection
- callback to waiting conversation handlers

### Must be designed for interactive flows

Architect and Evaluation need reply handling.

That means Telegram delivery must support:

- mapping incoming user replies to an active conversation
- timeouts
- resumed state after workflow pause
- ignoring unrelated messages safely

Telegram is not just an output channel in this architecture. It is also a reply channel.

---

## Message Formatting Rules

### General rules

- Use clean Telegram markdown that is known to be stable.
- Avoid over-formatting.
- Prefer short paragraphs over walls of text.
- Use code fences for code.
- Use headings sparingly but consistently.
- Do not send giant single-message dumps when sequential structure is clearer.

### Consistent stylistic rules

- Important labels in bold
- Small explanatory emphasis in italics
- One main idea per message
- Clear transitions between messages

### Hard limits

Telegram has a hard message limit around 4096 characters.

Implementation rule:

- Split any over-limit message before sending
- Never rely on Telegram to gracefully truncate

Recommended helper:

```ts
function splitTelegramMessage(text: string, maxLength = 3800): string[]
```

Use a safer internal limit than the platform maximum to allow formatting overhead.

---

## Teaching Session Format

Teaching delivery is the most important output in the system.

### Standard sequence

1. Layer 3 injection if present
2. Session header
3. Core concept explanation
4. Real example
5. Code snippet when relevant
6. Explicit connection to prior learning
7. Tomorrow preview

### Why this separation matters

This structure creates:

- pacing
- anticipation
- readability
- better retention

It also makes failures safer. If one message fails, the whole lesson is not one giant corrupted payload.

---

## Layer 3 Injection Rules

Layer 3 is live context. It must enrich, not derail.

### Delivery behavior

- Check Layer 3 before lesson generation
- Send at most 1 Layer 3 item at the start of a lesson
- Choose the highest-priority valid item
- Leave remaining items queued if still relevant and not expired

### Layer 3 item shape

Layer 3 items should already be pre-formatted or near-preformatted by the producing agent.

Required fields should include:

- `itemId`
- `type`
- `content`
- `sourceAgent`
- `priority`
- `expiresAt`
- `consumedAt`

### Layer 3 constraints

- Expired items must never be shown
- Malformed items should be logged and skipped
- Contradiction items should not be silently reworded into a different meaning
- News-connected items should stay short and contextual

### Intent rule

Layer 3 should answer:

- what changed
- why it matters now
- why it is relevant to today's learning

---

## News Digest Format

The digest should be readable in one pass and useful without opening every link.

### Digest message structure

Recommended top-level format:

```text
AI Digest - {Date}

1. {headline}
What changed: ...
Why it matters: ...
Should you care now: ...
Link: ...

2. {headline}
...
```

### Per-item rules

Each digest item should ideally answer:

- what changed
- what it replaces or challenges
- impact
- whether to invest time now

### Digest size rules

- Keep the number of items small
- Prefer 3-6 high-signal items over 15 shallow ones
- If an item is highly relevant to active learning, also consider routing it to Layer 3

### Digest vs Layer 3 rule

Not every important item should be both in the digest and in Layer 3.

Use this rule:

- broad important item -> digest
- directly curriculum-relevant and time-sensitive item -> Layer 3
- both only when the overlap is truly justified

---

## Architect Conversation Delivery

Architect should ask one question at a time.

### Why

Because onboarding quality collapses when the system asks 5 things at once and gets messy replies.

### Message style

- warm
- direct
- clear
- one prompt at a time

### Conversation state requirements

Telegram delivery must work with a persisted conversation model that supports:

- current question id
- expected response type
- message correlation id
- expiration
- prior turns

Do not build Architect as a fragile in-memory-only flow if workflows may pause or restart.

---

## Evaluation Conversation Delivery

Evaluation should feel conversational, not like a quiz form.

### Delivery rules

- one question at a time
- acknowledge before probing deeper
- follow-up only when the answer reveals uncertainty, a gap, or a misconception
- avoid robotic repetition

### Response timing

The system must wait for user response without losing state.

That means the Telegram layer and workflow layer together must handle:

- active pending question tracking
- resumed processing after reply
- timeout if no reply arrives

---

## Rate Limiting Handling

Telegram allows high throughput, but LRNR should be conservative.

### Soft sending rules

- send sequential lesson messages with a small pause between them
- do not burst many messages instantly unless necessary
- use a queue or throttled sender if multiple workflows could send close together

Recommended approach:

```ts
await safeSendMarkdown(userId, message1);
await sleep(300);
await safeSendMarkdown(userId, message2);
```

### Retry behavior

If a send fails:

1. retry once with short backoff
2. if still failing, log context
3. decide whether to continue or abort based on message criticality

### Criticality rule

- For onboarding/evaluation single prompts, failure is critical because the conversation cannot continue correctly without them
- For a multi-message lesson, one failure should be logged and the rest should continue when safe, unless message ordering is broken badly enough to make the rest confusing

---

## Duplicate Delivery Protection

This is essential.

The system must not send the same lesson twice because of retries or workflow duplication.

### Required checks

Before teaching delivery:

- check whether today's session is already marked `delivered`
- check whether a delivery record exists for the same `sessionId`

Before news digest delivery:

- check whether the digest for that date was already sent

Before Architect/Evaluation prompts:

- avoid sending the same pending question multiple times unless intentionally retried

---

## Error Scenarios and Handling

| Scenario | Handling |
|---------|----------|
| Message exceeds safe length | Split before sending |
| Markdown formatting breaks | Fallback to plain text send for that message |
| Telegram send fails once | Retry once with backoff |
| Telegram send fails twice | Log and mark delivery issue |
| Layer 3 item malformed | Skip and log |
| Session already delivered | Return without re-sending |
| User replies after conversation timeout | Send polite reset message and require fresh flow |
| Multiple Layer 3 items present | Send only highest priority item |

---

## Delivery Ordering Rules

Order matters.

### Teaching ordering

- Layer 3 first
- orientation second
- explanation before code
- code before tomorrow preview

### News ordering

- highest impact first
- most directly relevant second
- lower-priority exploratory items last

### Evaluation ordering

- opening prompt
- question
- follow-up if needed
- closeout / acknowledgment

---

## Helper Functions Recommended

```ts
formatLessonHeader(session)
formatLayer3Injection(item)
formatRealExample(example)
formatCodeBlock(language, code)
formatNewsDigest(items, date)
splitTelegramMessage(text, maxLength?)
safeSendMarkdown(userId, text)
sendMessageSequence(userId, messages)
```

These helpers keep formatting logic out of agent business logic.

---

## Logging and Observability

Every delivery flow should log:

- user id
- session id or digest date
- message count
- split count
- retries
- failures
- elapsed delivery time

Do not log secrets or unnecessary full private text bodies in production logs.

---

## Testing This System

Priority tests:

- messages split safely under Telegram limits
- already-delivered session does not resend
- malformed Layer 3 item is skipped safely
- digest formatting keeps required sections
- multi-message teaching sequence stays in correct order
- markdown fallback works when formatting breaks
- conversation timeout handling behaves correctly

---

## What This System Must NOT Do

- Must NOT send giant wall-of-text messages when the content should be sequenced.
- Must NOT re-send an already delivered lesson.
- Must NOT surface expired Layer 3 items.
- Must NOT assume Telegram is only output; it is also a reply channel.
- Must NOT let raw Telegraf calls spread across unrelated files.
- Must NOT let formatting logic become mixed into core curriculum or evaluation reasoning code.
