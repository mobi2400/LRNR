CREATE TABLE "interview_reactions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"principal_user_id" text NOT NULL,
	"was_anything_wrong" boolean NOT NULL,
	"note" text,
	"contact" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_sessions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"principal_user_id" text NOT NULL,
	"topic_slug" text NOT NULL,
	"status" text NOT NULL,
	"turn_cap" integer NOT NULL,
	"current_probe" text,
	"turns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verdict_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_verdict_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"principal_user_id" text NOT NULL,
	"topic_slug" text NOT NULL,
	"total_turns" integer NOT NULL,
	"scored_turns" integer NOT NULL,
	"unscored_turns" integer NOT NULL,
	"verdict" jsonb,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "interview_sessions_principal_idx" ON "interview_sessions" USING btree ("principal_user_id","created_at");--> statement-breakpoint
CREATE INDEX "interview_verdict_log_logged_at_idx" ON "interview_verdict_log" USING btree ("logged_at","id");