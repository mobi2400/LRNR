DROP INDEX IF EXISTS "concepts_user_topic_idx";--> statement-breakpoint
CREATE INDEX "concepts_user_topic_idx" ON "concepts" USING btree ("user_id","topic_slug","slug","id");--> statement-breakpoint
DROP INDEX IF EXISTS "job_runs_user_status_idx";--> statement-breakpoint
CREATE INDEX "job_runs_user_status_idx" ON "job_runs" USING btree ("user_id","status","created_at","id");--> statement-breakpoint
DROP INDEX IF EXISTS "job_runs_user_type_created_idx";--> statement-breakpoint
CREATE INDEX "job_runs_user_type_created_idx" ON "job_runs" USING btree ("user_id","job_type","created_at","id");--> statement-breakpoint
DROP INDEX IF EXISTS "topic_briefs_user_created_idx";--> statement-breakpoint
CREATE INDEX "topic_briefs_user_created_idx" ON "topic_briefs" USING btree ("user_id","created_at","id");--> statement-breakpoint
DROP INDEX IF EXISTS "delivery_outbox_ready_idx";--> statement-breakpoint
CREATE INDEX "delivery_outbox_ready_idx" ON "delivery_outbox" USING btree ("user_id","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "delivery_outbox_user_created_idx" ON "delivery_outbox" USING btree ("user_id","created_at","id");--> statement-breakpoint
DROP INDEX IF EXISTS "rag_memory_user_topic_event_idx";--> statement-breakpoint
CREATE INDEX "rag_memory_user_topic_event_idx" ON "rag_memory" USING btree ("user_id","topic_slug","event_type","created_at","id");--> statement-breakpoint
DROP INDEX IF EXISTS "rag_memory_user_concept_event_idx";--> statement-breakpoint
CREATE INDEX "rag_memory_user_concept_event_idx" ON "rag_memory" USING btree ("user_id","concept_slug","event_type","created_at","id");--> statement-breakpoint
DROP INDEX IF EXISTS "rag_memory_unresolved_idx";--> statement-breakpoint
CREATE INDEX "rag_memory_unresolved_idx" ON "rag_memory" USING btree ("user_id","topic_slug","event_type","created_at","id") WHERE "is_resolved" = false;--> statement-breakpoint
CREATE INDEX "rag_memory_user_created_idx" ON "rag_memory" USING btree ("user_id","created_at","id");
