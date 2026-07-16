# LRNR - Frontend UX Audit and Design System

> Phase 1 frontend redesign contract. Use this before changing `globals.css`, `AppShell`, dashboard, onboarding, lesson, review, curriculum, settings, auth, loading, or error UI.

## Product Verdict

The current Phase 1 frontend is a protected application shell with the first shape of a learning cockpit, but it is not yet a production-quality daily study surface. It proves the private routes exist and some backend contracts are connected. It still reads too much like implementation scaffolding, uses conflicting style foundations, and does not yet make the next learning action unmistakable across every state.

The redesign should move LRNR toward a calm instrument panel: warm mineral canvas, paper-like reading surfaces, deep evergreen actions, graphite text, cobalt focus, restrained amber warnings, generous spacing, and quiet borders. It must feel like a serious personal learning operating system for one owner, not a SaaS dashboard, developer console, or generic card grid.

## Current Foundation Audit

### CSS and Tokens

- `src/app/globals.css` currently has an early token block and a later "Phase 1 learning-cockpit foundation" override block. This creates a fragile cascade where later rules silently change earlier design intent.
- The file mixes old beige/serif defaults with later system-font cockpit overrides. Controls inherit Georgia until the later block corrects body typography, so token consolidation must happen before adding more components.
- Several selectors are duplicated or effectively redefined: `:root`, `body`, `.cockpit-shell`, `.cockpit-sidebar`, `.cockpit-page`, `.cockpit-panel`, navigation items, and responsive cockpit rules.
- Page-specific dashboard rules already live in the global stylesheet. Keep only shared primitives in global CSS; move page-specific styling into reusable component classes or scoped CSS modules when the next implementation slice touches them.
- `prefers-reduced-motion` exists and should be preserved, but the full transition system still needs semantic durations and no decorative animation.

### Shell and Navigation

- `AppShell` has the correct five destinations: Today, Lesson, Review, Path, Settings.
- `aria-current="page"` is present on the active destination.
- Active navigation is still mostly color/background based. Add a second cue such as a leading bar, inset mark, or stable shape change.
- The sidebar exposes raw unlock expiration in primary navigation metadata. Move private-session timing into subordinate settings/privacy copy, or phrase it as "Private workspace active" unless an exact timestamp is genuinely useful.
- Long owner identities need reliable truncation with a visible label and safe wrapping behavior.
- The tablet/mobile nav becomes horizontal and scrollable, which keeps destinations reachable, but it still needs explicit 390px verification for Settings visibility, tap target size, and no horizontal viewport overflow.
- Add a skip-to-content link when the shell is redesigned so keyboard users can bypass repeated navigation.

### Dashboard

- The dashboard has begun to prioritize "Today" and a dominant continue action, which is the right direction.
- State handling is incomplete. It distinguishes roughly between "has learning path" and "no learning path", but the product requires separate states for no goal, onboarding in progress, onboarding processing, path exists but lesson not ready, lesson ready, completed with next session available, workflow failed, alerts requiring attention, and topic completed.
- Progress percent is computed from completed/total sessions but is not clamped. It must never display below 0 or above 100, and it must avoid misleading percentages when total sessions is zero.
- Current topic displays a slug. Replace learner-facing slugs with titles when the contract supports them; otherwise label slug display as a temporary contract gap in the implementation note.
- Workflow copy is friendlier than before, but route/job terminology must stay out of primary learner UI.
- Alerts are counted but not classified into action/no-action states.

### Onboarding

- `OnboardingPanel` keeps text in local state during pending/error states and uses idempotency keys, which is good.
- Copy still says "Architect Onboarding", "topic brief", "memory seed", and "curriculum generation". Replace with learner-facing language such as "Build your learning path", "starting point", and "LRNR is mapping your first steps".
- The flow needs an explicit four-step progress model, one question/action at a time, rationale copy, accessible error association, and aria-live feedback.
- Completion needs one obvious next action based on the actual backend state, not two equal links.

### Lesson

- The current lesson page reads persisted lesson state and does not generate a lesson during normal load, which preserves the backend contract.
- The layout uses equal grid cards for mental model, explanation, diagram, code, mistakes, and action. The lesson needs a 680-760px continuous reading column with a clear hierarchy: context, title/objective, mental model, explanation, diagram, examples/code, mistakes, review entry, sources, completion.
- Code blocks use `white-space: pre-wrap`, which can destroy code structure. Use horizontal scrolling with preserved whitespace.
- Diagrams are rendered in a generic `pre`; they need overflow-safe containment and a future renderer only when the content type supports it.
- Sources/trust are not surfaced on the page even though the lesson payload contract includes sources.
- The completion action prevents duplicate clicks while pending, but success/error feedback needs `aria-live`.

### Review

- The review page exposes `expectedPoints` immediately. This violates the active-recall requirement and must be fixed in the review slice.
- Hints are shown by default. Hide hints behind an intentional, keyboard-accessible disclosure.
- The current API does not define answer persistence for review answers. Do not pretend answers are saved until a typed API exists. Implement an honest read-only guided review with local composition only if needed.
- The tone should be calm and reflective, not exam-like.

### Curriculum and Settings

- Curriculum currently contains placeholder Layer cards. Replace them with the truthful `/api/curriculum/map` data: current topic, ordered sessions, completed/current/upcoming status, concepts, and a vertical timeline.
- Do not add graph libraries in Phase 1 unless the data contract genuinely requires a graph.
- Settings are placeholder-only. Build only the contract-backed areas: owner identity, notifications/Telegram, voice availability, privacy/private-session information.
- Unsupported controls must be marked upcoming or informational, not presented as working toggles.

### Auth, Loading, and Error States

- Login and unlock already express a two-gate flow, but they still link to Auth.js docs and `/api/me`. Remove developer/debug links from learner-facing auth screens.
- Inputs have visible labels and autocomplete attributes, but errors are not associated to fields/forms with `aria-describedby` and `aria-live`.
- `error.tsx` displays the raw error message as primary copy. Replace with safe learner-facing copy and optional technical details only when safe.
- `loading.tsx` and `error.tsx` render outside `AppShell`, so the protected app can visually jump during route transitions or failures.

### Accessibility and Responsiveness

- Keep one clear `h1`/page-heading strategy. Current app pages mostly use `h2` inside route pages because the shell brand uses `h1`; the next shell redesign should make page-level semantics intentional.
- Focus-visible styling exists globally and should be preserved.
- All interactive targets must remain at least 44px high at 390px, 768px, 1024px, and 1440px.
- Avoid color-only statuses. Pair visual status with text labels or shape.
- Verify zoom/reflow, long topic names, long emails, long lesson titles, long URLs, and long error messages.

## Design System Source of Truth

Replace the current duplicate token blocks with one semantic token block before continuing feature UI work.

### Semantic Color Tokens

Use these names in CSS, even if the exact hex values are refined during implementation:

```css
:root {
  --lrnr-canvas: #f4f2ec;
  --lrnr-canvas-depth: #ebe8df;
  --lrnr-surface: #fffefa;
  --lrnr-surface-raised: #ffffff;
  --lrnr-surface-muted: #f0eee7;
  --lrnr-surface-interactive: #f7faf7;
  --lrnr-text-primary: #20231f;
  --lrnr-text-secondary: #62675f;
  --lrnr-text-tertiary: #858a82;
  --lrnr-border-soft: rgba(50, 55, 49, 0.11);
  --lrnr-border-strong: rgba(32, 35, 31, 0.22);
  --lrnr-primary: #174f45;
  --lrnr-primary-hover: #103e36;
  --lrnr-focus: #2b68d8;
  --lrnr-success: #1f7a4d;
  --lrnr-warning: #a96c12;
  --lrnr-danger: #a33d35;
  --lrnr-info: #2f628f;
  --lrnr-code-surface: #1f2520;
  --lrnr-disabled: #b8bdb4;
}
```

Do not keep legacy aliases such as `--background`, `--surface`, and `--accent` unless they are temporary compatibility aliases next to the canonical token block.

### Scale Tokens

- Spacing: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Radius: controls `10-12px`, cards `16-20px`, large containers `24px`, pills only for true pill controls.
- Elevation: soft border first, small shadow for raised surfaces, stronger shadow only for primary action or modal surfaces.
- Control heights: minimum `44px`; primary action `48px`; text areas sized for comfortable mobile input.
- Page width: app content max `1180px`; reading width `680-760px`; sidebar width `220-240px`.
- Transitions: `120-180ms` for hover/focus state only; respect reduced motion.

### Typography

- Use a reliable system sans stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Use a dedicated monospace stack for code: `"SFMono-Regular", Consolas, "Liberation Mono", monospace`.
- UI body text should sit around `15-16px`.
- Lesson prose should sit around `18px` with generous line height and a 65-75 character line length.
- Avoid oversized marketing headings inside compact panels. Page headings may be large; card headings should stay tight and readable.
- Letter spacing should be `0` for normal text. Use uppercase labels sparingly.

### Core Variants To Build

Create or standardize reusable variants for:

- Primary button
- Secondary button
- Quiet button
- Destructive button
- Text link
- Hero action panel
- Standard card
- Reading card
- Progress card
- Activity card
- Trust/source card
- Warning card
- Empty state
- Form card
- Skeleton
- Success/error feedback

Do not create nested cards. Use cards for individual repeated items, modals, or genuinely framed tools. Page sections should be unframed layouts or full-width bands.

## Page Redesign Contracts

### App Shell

- Destinations: Today, Lesson, Review, Path, Settings.
- Use semantic `nav`, `main`, and a skip-to-content link.
- Keep identity and private-session status subordinate.
- Make active navigation visible by more than color.
- Keep every nav destination reachable at 390px without horizontal overflow.

### Dashboard

Priority order:

1. Today's primary learning action.
2. Current session/topic.
3. Progress and momentum.
4. Next review or next safe step.
5. Friendly LRNR activity.
6. Source/trust information when available.
7. Alerts and notifications.
8. Optional technical details.

The dashboard must be driven only by existing contracts. If source confidence, next-review detail, or title fields are unavailable, document the contract gap rather than fabricating it.

### Onboarding

Use learner-facing terms and a four-step model:

1. Goal
2. Starting point
3. Probe
4. Path building

Show why each answer matters, preserve input on pending/error, and make async feedback polite and screen-reader visible.

### Lesson

Use one primary reading column with supporting side/meta content only when it does not distract. The page should support long study sessions without cramped text or equal-card fragmentation.

Do not add "Explain differently", voice, hint, or source-confidence controls until typed APIs support them. Track those as follow-up contracts.

### Review

Hide hints and expected points by default. Expected points may appear only after an attempt or after an explicit reveal action that warns the owner it will show the guide.

Until answer persistence exists, call the experience a guided review, not a submitted answer workflow.

### Curriculum

Use a responsive vertical timeline before any graph visualization. Show ordered sessions, status, concepts, current position, progress, empty/loading/error states, and a clear return to the current lesson.

### Settings

Organize into owner identity, notifications/Telegram, voice availability, and privacy/private-session information. Do not expose secrets. Do not show fake working controls.

### Auth

Login and unlock should feel like a reassuring two-gate flow:

- Gate 1: identity verification.
- Gate 2: private LRNR unlock.

Remove developer documentation links and raw API inspection links from normal auth screens.

## Contract Gaps To Track

- Dashboard does not currently expose source confidence or next-review details.
- Dashboard appears to expose topic slug more readily than topic display title.
- Review answer persistence is not defined in the Phase 1 API contract.
- Curriculum map contract currently uses `roadmap: unknown`; the frontend must normalize only what is safely typed or display a truthful session timeline.
- Voice settings expose availability but not full editing behavior unless backend settings supports it.
- Source/trust UI depends on persisted lesson/source payload quality.

## Required Visual QA Matrix

Every implementation commit after this doc must verify:

| Width  | Required checks                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------- |
| 390px  | no horizontal overflow, all nav destinations reachable, 44px targets, forms usable, long text wraps |
| 768px  | tablet navigation understandable, primary action early, cards do not become cramped                 |
| 1024px | shell/content balance, no sticky obstruction, lesson reading width comfortable                      |
| 1440px | page does not sprawl, hierarchy remains clear, reading column stays within target width             |

Also verify keyboard navigation, focus-visible, reduced motion, contrast, long titles/emails/URLs, loading states, and safe error states.

## Implementation Sequence

1. Consolidate tokens, typography, focus, reduced motion, and shared variants.
2. Redesign app shell and responsive navigation.
3. Rebuild dashboard around the next learning action and honest progress states.
4. Improve onboarding into a personal learning-path flow.
5. Redesign the lesson reading experience.
6. Add guided review without early answer spoilers.
7. Implement truthful curriculum and settings surfaces.
8. Complete auth, loading, empty, partial, and error states.
9. Run responsive, accessibility, performance, typecheck, lint, build, and visual QA.

Stop after each verified commit unless continuous execution is explicitly authorized.
