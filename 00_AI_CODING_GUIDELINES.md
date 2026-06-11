# LRNR - AI Coding Guidelines
> **Use this file in every coding session.**
> **This file defines how AI should write, review, structure, and maintain code in this project.**

---

## Purpose

This document is the coding contract for any AI that writes code for LRNR.

The goal is not just to make code that works. The goal is to make code that is:

- readable by humans
- easy to debug
- easy to extend
- safe to refactor
- strongly typed
- operationally predictable
- well documented inside the codebase

Every coding session should follow this file together with:

- `01_projectoverview.md`
- `02_architecture.md`
- `03_DATA_SCHEMA.md`
- `04_STACK_AND_CONVENTIONS.md`

If there is a conflict between this file and the actual codebase later, prefer the real codebase patterns after verifying them carefully. Until the code exists, this file is the implementation standard.

---

## Core Principles

### 1. Code must be readable first

Do not optimize for cleverness. Optimize for clarity.

A future developer should be able to open a file and quickly understand:

- what the file does
- what the function does
- what the inputs are
- what the outputs are
- what side effects happen
- what can fail
- what assumptions are being made

If a piece of logic is hard to understand in one pass, simplify it or extract it.

### 2. Strong typing is mandatory

Do not allow vague or loose typing when a precise type can be written.

Always prefer:

- explicit interfaces
- named types
- discriminated unions
- enums or string literal unions where appropriate
- typed return values
- typed parameters

Avoid:

- `any`
- `unknown` without narrowing
- giant untyped objects
- hidden shape mutations
- passing partially understood objects between layers

### 3. State must be explicit

Agent systems fail when state becomes ambiguous.

Every graph state, node state, workflow payload, queue item, and database write shape must be explicitly defined.

Never let state evolve informally inside random functions.

State transitions must be:

- visible
- typed
- predictable
- minimal
- documented

### 4. Side effects must be isolated

Business logic should be separated from side effects.

Keep these boundaries clear:

- agent logic
- graph orchestration
- database access
- external API calls
- Telegram delivery
- scraping
- embeddings
- logging

Pure decision-making code should not directly talk to external services unless that is the file's explicit responsibility.

### 5. Documentation is part of the implementation

AI should not write code and leave the intent hidden.

Every important module should explain:

- why it exists
- what contract it owns
- what it must never do
- what assumptions it relies on

Documentation should live:

- in concise file-level comments
- in function comments where needed
- in type definitions
- in adjacent markdown when the system behavior is large enough

---

## File-Level Rules

### File structure must be intentional

Each file should have a single clear responsibility.

Good examples:

- one agent per file
- one graph per file
- one service wrapper per file
- one db ownership domain per file
- one type group per file

Bad examples:

- one file containing several unrelated agents
- one utilities file with dozens of unrelated helpers
- a database file that also contains LLM prompting logic
- an agent file that also handles Telegram formatting and scraping directly

### Every file should start with orientation

Add a short top-level comment when the file contains meaningful logic.

Example:

```ts
/**
 * Architect agent.
 * Owns onboarding discovery, prerequisite mapping, and Layer 1 roadmap creation.
 * Must never research topic sources directly or send Telegram messages.
 */
```

This should not be boilerplate on tiny type-only files, but it should exist on important modules.

### Keep imports clean

- Import only what is used.
- Avoid circular dependencies.
- Avoid deep cross-layer imports when a shared type or helper should exist instead.
- Prefer absolute project aliases later if the repo adds them consistently.

---

## Function-Level Rules

### Functions must do one understandable thing

Each function should have one main purpose.

If a function is doing too many things, split it into smaller helpers.

### Always type inputs and outputs

Do not rely on inference alone for exported functions.

Always define:

- parameter types
- return type
- async return type

Example:

```ts
export async function runArchitectAgent(
  state: LearningGraphState
): Promise<Partial<LearningGraphState>> {
  // ...
}
```

### Use descriptive naming

Prefer names that explain behavior:

- `buildInitialProfileFromDiscovery`
- `mergeScoutFindingsIntoQueue`
- `calculateNextEvaluationDate`

Avoid vague names:

- `handleData`
- `runThing`
- `processInfo`
- `doUpdate`

### Use early returns

Prefer early exits for invalid or empty cases.

This keeps code flatter and easier to scan.

### Keep functions short where possible

Shorter functions are easier to test and debug.

As a rough guide:

- helpers should usually stay small
- orchestration functions can be longer if they are clearly segmented
- very long functions should be broken into named steps

---

## Comments Rules

### Comments should explain intent, not syntax

Good comment:

```ts
// Re-check active misconceptions before generating today's explanation
// so the lesson can reinforce unstable concepts without rewriting the plan.
```

Bad comment:

```ts
// Set variable to true
```

### Add comments for important logic blocks

AI should add comments before:

- non-obvious branching
- priority rules
- reconciliation logic
- scoring logic
- retry logic
- fallback behavior
- concurrency protections
- data integrity checks

### Add doc comments to exported contracts

Use JSDoc or concise comments for exported functions, interfaces, and classes when the contract is not trivial.

Example:

```ts
/**
 * Queue item produced by background agents for nightly curriculum reconciliation.
 * Priority 1 must always be processed before any scout or news enrichment.
 */
export interface AgentUpdateQueueItem {
  // ...
}
```

### Keep documenting as code evolves

When code changes, comments must be updated too.

Outdated comments are worse than no comments.

---

## State Design Rules

### Graph state must be explicitly modeled

Each LangGraph workflow should have a dedicated state type file.

State should include only what the graph actually needs.

Do not dump entire database records into graph state if only a subset is required.

### Define node input and output expectations

Every node should be understandable as:

- what it reads from state
- what it reads from the database
- what it writes to state
- what it writes externally

### Prefer additive state updates

Nodes should return partial updates rather than mutating shared objects invisibly.

Good:

```ts
return {
  profile,
  currentTopic,
  architectOutput,
};
```

Bad:

```ts
state.profile.currentTopic = topic;
state.someNestedThing.otherThing = x;
return state;
```

### Model status explicitly

Whenever a process has stages, define them as typed statuses.

Examples:

- `pending | processing | delivered | failed`
- `not_started | in_progress | complete`
- `active | corrected`

This is better than booleans that lose meaning over time.

### Avoid hidden coupling through state

One node should not depend on a state field that another node writes unless that dependency is clearly documented in the graph contract.

---

## Agent Design Rules

### Each agent must have a clear responsibility boundary

Every agent should be able to answer:

- what problem do I own
- what data do I require
- what data do I produce
- what am I forbidden from doing

### Agents must not bypass system boundaries

Agents should not:

- call raw LLM providers directly if an abstraction exists
- write directly to unrelated database tables
- send Telegram messages unless they are the delivery owner
- fetch external content if another service wrapper owns that behavior
- silently modify roadmap or session layers outside their permissions

### Agents should use tools deliberately

When a task naturally depends on tooling, bind it through explicit wrappers or helper services instead of burying tool usage inside prompt text.

Examples:

- Firecrawl wrapper for scraping
- embeddings service for vector writes
- Telegram service for sending messages
- db modules for all persistence
- queue service for inter-agent coordination

### Build custom tools when repeated behavior appears

If the same external or structured behavior is repeated across agents, create a project-owned tool/wrapper.

Examples:

- `fetchTopicSources()`
- `writeLearningEventToRag()`
- `scoreSourceCredibility()`
- `enqueueCurriculumUpdate()`
- `renderTelegramLessonMessages()`

Do not duplicate this logic across agent files.

### Agents should degrade gracefully

If one source fails, the whole agent should not collapse unless that source is critical.

Each agent should define:

- retry behavior
- partial failure behavior
- logging behavior
- fallback behavior
- hard-stop conditions

---

## TypeScript Rules

### Use strict TypeScript

The project should enable strict mode and keep it on.

Target expectations:

- `strict: true`
- `noImplicitAny: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`

### Prefer interfaces for object contracts

Use interfaces or named types for shared shapes.

Inline object types are acceptable only when the shape is very local and simple.

### Use unions for domain states

Prefer:

```ts
type EvaluationStatus = 'pending' | 'running' | 'complete' | 'failed';
```

over:

```ts
status: string;
```

### Narrow unknown data at boundaries

Any data from:

- LLM output
- external APIs
- scraping responses
- environment variables
- JSON parsing

must be validated or narrowed before trusted usage.

### Parse structured output safely

If LLM output is expected as JSON:

- request JSON mode when available
- parse safely
- validate shape
- fail loudly when structure is missing

Never assume generated JSON is correct.

---

## Error Handling Rules

### Fail loudly on contract violations

If required data is missing, throw a meaningful error.

Example:

```ts
if (!profile.currentTopicId) {
  throw new Error('Curriculum builder requires currentTopicId before initial session generation');
}
```

### Errors must contain context

Include useful debugging information:

- agent name
- node name
- user id
- topic id
- workflow name
- operation that failed

### Use typed domain errors when appropriate

For important flows, create named error types or clear error categories:

- validation error
- external API error
- rate limit error
- persistence error
- workflow invariant error

### Separate user-facing failure from system failure

Telegram users should not receive raw stack traces.

System logs can contain details.
User messages should be clear and calm.

---

## Performance Rules

### Optimize after clarity, but do not ignore complexity

AI should actively think about:

- time complexity
- space complexity
- network cost
- LLM token cost
- scraping cost
- database query cost

### Avoid unnecessary repeated work

Examples:

- do not refetch the same source repeatedly in one run
- do not re-embed unchanged content
- do not recompute sorted dependencies if cached structure exists
- do not query the same profile data multiple times in the same workflow if state already has it

### Batch where it makes sense

Use batching for:

- db writes
- embedding generation
- source scoring
- queue processing

But only when batching does not make debugging much harder.

### Prefer predictable complexity

When modeling curriculum ordering, queue reconciliation, and contradiction scanning, choose algorithms that remain understandable and predictable under growth.

### Measure expensive paths

Add logging around:

- LLM calls
- scrape counts
- retry counts
- queue sizes
- execution time per node

You cannot optimize what you do not observe.

---

## Database Rules

### Database access must go through db modules

No agent should directly write raw queries scattered through the codebase.

Each domain should have a dedicated access layer:

- `profile.ts`
- `rag.ts`
- `curriculum.ts`
- `knowledge-base.ts`
- `queue.ts`
- `news.ts`

### Encode write permissions in code

Application logic must enforce who can write what.

Example:

- only architect may write Layer 1
- only curriculum builder may modify Layer 2
- many agents may append Layer 3

These rules should be checked in dedicated db functions, not just assumed in comments.

### Prefer explicit write functions over generic updates

Good:

- `updateNextEvaluationDue()`
- `appendLayer3Item()`
- `markSessionDelivered()`
- `createTopicBrief()`

Avoid broad functions like:

- `updateProfile(data)`
- `patchCurriculum(anything)`

unless they are tightly controlled internally.

### Preserve provenance

Any stored claim or important generated content should keep enough metadata to trace:

- source
- author or system origin
- timestamp
- agent
- confidence
- topic
- related concept

---

## LLM Usage Rules

### All LLM calls go through one abstraction layer

Never call providers directly from agent code if an LLM wrapper exists.

The wrapper should standardize:

- provider selection
- model selection
- retries
- timeouts
- JSON mode
- logging
- token usage tracking

### Prompts should be modular

Store prompts in dedicated prompt files, not inline giant strings inside agent files.

Prompt files should export typed builders.

### Do not let prompts become hidden business logic

Business rules must live in code and types where possible.

Prompts should express reasoning tasks, not replace system structure.

### Validate model output

Never trust:

- JSON shape
- enum values
- IDs
- score ranges
- boolean decisions

Always validate and normalize.

---

## Testing Rules

### Write tests for behavior that can break silently

Priority test targets:

- dependency ordering
- queue reconciliation
- Layer 2 N+2 enforcement
- priority conflict resolution
- date scheduling
- profile permission rules
- parsing and validation helpers
- contradiction classification routing

### Prefer focused tests

Do not create giant brittle tests unless end-to-end behavior truly requires it.

Test at multiple levels:

- unit tests for pure helpers
- integration tests for db modules
- workflow tests for graph routes

### Mock expensive systems carefully

Mock:

- LLMs
- scraping
- embeddings
- Telegram delivery

Do not mock the entire program so heavily that tests stop representing reality.

---

## Logging Rules

### Logs must help reconstruct workflow behavior

Every major node should log:

- start
- finish
- duration
- critical decisions
- item counts
- failures

### Never log secrets

Do not log:

- API keys
- tokens
- private user content unless necessary for debugging
- embeddings

### Use structured logging

Prefer machine-readable logs over ad hoc string noise.

---

## Documentation Rules

### Keep code and docs aligned

When behavior changes materially, update:

- code comments
- related markdown docs
- types
- examples

### Document invariants

Important rules should be written in the code where they are enforced.

Examples:

- session updates cannot affect today or tomorrow
- architect owns roadmap creation
- only validated LLM JSON enters domain logic

### Add README-style notes for complex modules

If a module becomes large or highly important, add a short markdown note or strong file header so future coding sessions can load context quickly.

---

## Readability Standards

### Formatting

- Use consistent linting and formatting.
- Keep line lengths reasonable.
- Break complex conditions into named booleans.
- Prefer readable object construction over compressed one-liners.

### Control flow

- Avoid deeply nested `if` blocks when guard clauses are cleaner.
- Prefer `switch` for explicit domain branching.
- Extract hard-to-read branch logic into named helpers.

### Data transformations

- Name intermediate results meaningfully.
- Avoid long chained transformations when they hurt readability.
- If a pipeline is important, annotate its steps with comments.

---

## Recommended npm Packages

This workspace does not yet have a `package.json`, so these packages are recommendations for when the project scaffold is created.

### Core runtime

```bash
pnpm add @langchain/langgraph @langchain/core @supabase/supabase-js telegraf groq-sdk zod p-retry p-limit rss-parser @mobasshirkhan/docguard
```

### Development and TypeScript

```bash
pnpm add -D typescript tsx @types/node eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

### Testing

```bash
pnpm add -D vitest
```

### Optional utilities

```bash
pnpm add date-fns
```

### Why these packages

- `@langchain/langgraph` for graph orchestration
- `@langchain/core` for shared LangChain primitives if needed
- `@supabase/supabase-js` for data access
- `telegraf` for Telegram delivery
- `groq-sdk` for Groq model access
- `zod` for runtime validation of LLM and external data
- `p-retry` for retry policy
- `p-limit` for bounded concurrency
- `rss-parser` for feed ingestion
- `@mobasshirkhan/docguard` for documentation guarding and keeping implementation aligned with project docs
- `tsx` for local TypeScript execution without build friction
- `vitest` for fast testing
- `date-fns` for readable date operations

Do not install packages just because they are popular. Every package must earn its place.

---

## Package Rules

### Keep dependencies intentional

- Prefer fewer dependencies with strong utility.
- Avoid overlapping libraries that solve the same problem.
- Prefer libraries that fit TypeScript well.
- Avoid abandoned or weakly maintained packages.

### Wrap third-party libraries

Do not spread raw package usage everywhere.

Create local wrappers so packages can be replaced later with minimal churn.

Examples:

- `src/lib/groq.ts`
- `src/lib/telegram.ts`
- `src/lib/firecrawl.ts`

---

## Code Review Checklist For AI

Before finishing a coding task, check:

- Is the code readable in one pass?
- Are all exported functions typed?
- Are domain states explicit?
- Are comments present where the logic is not obvious?
- Is side-effect ownership clear?
- Are retries and failures handled properly?
- Are names descriptive?
- Is database access going through the proper layer?
- Is validation present for external or LLM data?
- Is the behavior aligned with architecture docs?
- Is there unnecessary complexity that can be removed?

---

## Final Standard

AI should write code here as if another engineer will inherit it tomorrow.

That means:

- clarity over cleverness
- explicitness over hidden magic
- types over guesswork
- documentation over silence
- structure over improvisation
- maintainability over short-term speed

The project should feel like a well-run engineering system, not a pile of generated files.
