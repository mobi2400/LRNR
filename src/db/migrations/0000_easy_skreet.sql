CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('telegram', 'in_app', 'email', 'push');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rag_event_type" AS ENUM('onboarding_response', 'session_summary', 'question_asked', 'evaluation_response', 'gap_detected', 'misconception_detected', 'misconception_corrected', 'concept_mastered', 'contradiction_resolved', 'layer3_injection');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('planned', 'ready', 'delivered', 'completed', 'skipped', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."topic_status" AS ENUM('active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "concept_prerequisites" (
	"user_id" uuid NOT NULL,
	"topic_slug" text NOT NULL,
	"concept_id" uuid NOT NULL,
	"prerequisite_concept_id" uuid NOT NULL,
	"strength" text DEFAULT 'required' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_prerequisites_pk" PRIMARY KEY("concept_id","prerequisite_concept_id")
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_slug" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"difficulty" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_brief_id" uuid,
	"topic_slug" text NOT NULL,
	"status" "topic_status" DEFAULT 'active' NOT NULL,
	"layer_1_roadmap" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"layer_2_sessions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"layer_3_live_queue" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_session_id" text,
	"current_session_index" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"last_delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_type" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"idempotency_key" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rag_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_id" uuid,
	"topic_slug" text,
	"concept_id" uuid,
	"concept_slug" text,
	"event_type" "rag_event_type" NOT NULL,
	"content" text NOT NULL,
	"retrieval_text" text,
	"synthesis_text" text,
	"embedding" vector(1536),
	"embedding_version" text DEFAULT 'v1' NOT NULL,
	"lexical_search_text" text,
	"source_agent" text NOT NULL,
	"source_id" uuid,
	"source_uri" text,
	"parent_document_id" uuid,
	"chunk_ordinal" integer,
	"token_count" integer,
	"confidence" numeric(5, 4) DEFAULT '0.8000' NOT NULL,
	"quality_score" numeric(5, 4),
	"is_resolved" boolean DEFAULT false NOT NULL,
	"superseded_by_id" uuid,
	"freshness_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"staleness_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE "topic_knowledge_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_brief_id" uuid,
	"topic_slug" text NOT NULL,
	"source_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concept_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"code_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interview_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"delivery_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"telegram_enabled" boolean DEFAULT true NOT NULL,
	"telegram_chat_id" text,
	"daily_learning_alert_enabled" boolean DEFAULT true NOT NULL,
	"evaluation_alert_enabled" boolean DEFAULT true NOT NULL,
	"digest_alert_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_slug" text NOT NULL,
	"title" text NOT NULL,
	"goal" text NOT NULL,
	"required_depth" text NOT NULL,
	"learner_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prerequisite_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concept_outline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mastery_intent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_agent" text DEFAULT 'architect_node' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_name" text,
	"current_goal" text,
	"current_topic_id" uuid,
	"current_topic_slug" text,
	"curriculum_position" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"learner_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stable_mastery_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active_misconceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_evaluation_due_at" timestamp with time zone,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "concept_prerequisites" ADD CONSTRAINT "concept_prerequisites_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_prerequisites" ADD CONSTRAINT "concept_prerequisites_prerequisite_concept_id_concepts_id_fk" FOREIGN KEY ("prerequisite_concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_state" ADD CONSTRAINT "curriculum_state_topic_brief_id_topic_briefs_id_fk" FOREIGN KEY ("topic_brief_id") REFERENCES "public"."topic_briefs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_knowledge_base" ADD CONSTRAINT "topic_knowledge_base_topic_brief_id_topic_briefs_id_fk" FOREIGN KEY ("topic_brief_id") REFERENCES "public"."topic_briefs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concept_prereq_user_topic_idx" ON "concept_prerequisites" USING btree ("user_id","topic_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "concepts_user_topic_slug_unique" ON "concepts" USING btree ("user_id","topic_slug","slug");--> statement-breakpoint
CREATE INDEX "concepts_user_topic_idx" ON "concepts" USING btree ("user_id","topic_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_state_user_topic_slug_unique" ON "curriculum_state" USING btree ("user_id","topic_slug");--> statement-breakpoint
CREATE INDEX "curriculum_state_user_status_idx" ON "curriculum_state" USING btree ("user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "curriculum_state_current_session_idx" ON "curriculum_state" USING btree ("user_id","current_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_idempotency_keys_user_key_unique" ON "api_idempotency_keys" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "job_runs_user_status_idx" ON "job_runs" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_idempotency_idx" ON "job_runs" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "rag_memory_user_topic_event_idx" ON "rag_memory" USING btree ("user_id","topic_id","event_type","created_at");--> statement-breakpoint
CREATE INDEX "rag_memory_unresolved_idx" ON "rag_memory" USING btree ("user_id","topic_id","event_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rag_memory_idempotency_idx" ON "rag_memory" USING btree ("user_id","idempotency_key") WHERE "rag_memory"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "rag_memory_lexical_idx" ON "rag_memory" USING gin (to_tsvector('english', coalesce("lexical_search_text", "content")));--> statement-breakpoint
CREATE UNIQUE INDEX "topic_knowledge_base_user_topic_slug_unique" ON "topic_knowledge_base" USING btree ("user_id","topic_slug");--> statement-breakpoint
CREATE INDEX "topic_kb_user_topic_idx" ON "topic_knowledge_base" USING btree ("user_id","topic_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_outbox_user_delivery_key_unique" ON "delivery_outbox" USING btree ("user_id","delivery_key");--> statement-breakpoint
CREATE INDEX "delivery_outbox_ready_idx" ON "delivery_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_id_unique" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_briefs_user_topic_slug_unique" ON "topic_briefs" USING btree ("user_id","topic_slug");--> statement-breakpoint
CREATE INDEX "topic_briefs_user_created_idx" ON "topic_briefs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profile_user_id_unique" ON "user_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_profile_current_topic_idx" ON "user_profile" USING btree ("user_id","current_topic_slug");
--> statement-breakpoint
alter table user_profile enable row level security;
alter table topic_briefs enable row level security;
alter table curriculum_state enable row level security;
alter table topic_knowledge_base enable row level security;
alter table rag_memory enable row level security;
alter table job_runs enable row level security;
alter table api_idempotency_keys enable row level security;
alter table delivery_outbox enable row level security;
alter table notification_preferences enable row level security;
alter table concepts enable row level security;
alter table concept_prerequisites enable row level security;

create policy "user_profile_owner_policy"
on user_profile
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "topic_briefs_owner_policy"
on topic_briefs
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "curriculum_state_owner_policy"
on curriculum_state
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "topic_knowledge_base_owner_policy"
on topic_knowledge_base
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "rag_memory_owner_policy"
on rag_memory
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "job_runs_owner_policy"
on job_runs
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "api_idempotency_keys_owner_policy"
on api_idempotency_keys
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "delivery_outbox_owner_policy"
on delivery_outbox
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "notification_preferences_owner_policy"
on notification_preferences
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "concepts_owner_policy"
on concepts
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "concept_prerequisites_owner_policy"
on concept_prerequisites
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

