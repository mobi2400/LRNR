# LRNR

LRNR is a personal-first learning operating system for guided AI learning — a
"Personal AI University" that researches a topic, teaches it through structured
daily sessions, and connects learning to live developments.

## Status

Phase 1 (private core) is implemented: owner-only auth, the learning cockpit
frontend, the Architect → Cartographer → Curriculum Builder → Teaching agent
pipeline, RAG memory, the daily-learning workflow, and Telegram alerting.

The agent layer is **hybrid**: in production each agent uses the LLM (Gemini)
for real reasoning and retrieval — the Architect runs an adaptive discovery
interview, the Cartographer synthesizes grounded, cited research from fetched
sources, the Curriculum Builder designs the session path, the Teaching agent
writes the lesson, and follow-up questions are answered through a tool-calling
loop that retrieves grounded evidence. Every agent keeps a deterministic
fallback that runs under test/offline (`NODE_ENV=test`) and on any model error,
so the pipeline is verifiable without network access and never hard-fails.

## Configuration

Copy `.env.example` and provide the required secrets. Relevant AI settings:

- `LLM_API_KEY` — Gemini API key for agent reasoning
- `LLM_MODEL` — optional model override (default `gemini-2.5-flash`)
- `EMBEDDING_API_KEY` — Gemini API key for embeddings
- `EMBEDDING_MODEL` — optional embedding model override (default `gemini-embedding-001`)

## Scripts

- `pnpm dev` — run the Next.js app
- `pnpm typecheck` / `pnpm lint` — static checks
- `pnpm vitest run` — full test suite
- `pnpm daily:run` — run the daily learning workflow
- `pnpm smoke:phase1` / `pnpm deploy:check` — phase 1 smoke and readiness checks

See `docs/` for architecture and phase plans and `AGENTS.md` for the agent
working guide.
