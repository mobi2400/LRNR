DROP INDEX "rag_memory_user_topic_event_idx";--> statement-breakpoint
DROP INDEX "rag_memory_unresolved_idx";--> statement-breakpoint
CREATE INDEX "job_runs_user_type_created_idx" ON "job_runs" USING btree ("user_id","job_type","created_at");--> statement-breakpoint
CREATE INDEX "rag_memory_user_concept_event_idx" ON "rag_memory" USING btree ("user_id","concept_slug","event_type","created_at");--> statement-breakpoint
CREATE INDEX "rag_memory_user_topic_event_idx" ON "rag_memory" USING btree ("user_id","topic_slug","event_type","created_at");--> statement-breakpoint
CREATE INDEX "rag_memory_unresolved_idx" ON "rag_memory" USING btree ("user_id","topic_slug","event_type","created_at") WHERE "rag_memory"."is_resolved" = false;