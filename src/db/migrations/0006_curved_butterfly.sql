CREATE TABLE "workflow_node_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workflow_run_id" text NOT NULL,
	"node_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_node_runs_user_workflow_node_idx" ON "workflow_node_runs" USING btree ("user_id","workflow_run_id","node_name");--> statement-breakpoint
CREATE INDEX "workflow_node_runs_claim_idx" ON "workflow_node_runs" USING btree ("user_id","status","lease_expires_at","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_node_runs_idempotency_idx" ON "workflow_node_runs" USING btree ("user_id","idempotency_key");