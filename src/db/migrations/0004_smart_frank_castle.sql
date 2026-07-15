CREATE TYPE "public"."source_type" AS ENUM('article', 'markdown', 'transcript', 'code_documentation', 'claim', 'learner_history');--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_id" uuid,
	"topic_slug" text,
	"source_id" uuid,
	"source_type" "source_type" NOT NULL,
	"title" text NOT NULL,
	"canonical_url" text,
	"author" text,
	"publisher" text,
	"language" text DEFAULT 'en' NOT NULL,
	"permission_scope" text DEFAULT 'owner_private' NOT NULL,
	"content_hash" text NOT NULL,
	"normalized_content_hash" text NOT NULL,
	"document_version" text DEFAULT 'v1' NOT NULL,
	"effective_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"freshness_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"source_quality_score" numeric(5, 4),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"topic_id" uuid,
	"topic_slug" text,
	"concept_id" uuid,
	"concept_slug" text,
	"curriculum_layer" text,
	"source_agent" text NOT NULL,
	"chunk_strategy" text NOT NULL,
	"chunk_strategy_version" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"parent_chunk_id" uuid,
	"section_heading" text,
	"section_path" text,
	"retrieval_text" text NOT NULL,
	"synthesis_text" text,
	"token_count" integer NOT NULL,
	"content_hash" text NOT NULL,
	"citation_anchor" text NOT NULL,
	"character_start" integer,
	"character_end" integer,
	"embedding" vector(1536),
	"embedding_model" text,
	"embedding_version" text,
	"embedding_dimensions" integer,
	"source_quality_score" numeric(5, 4),
	"freshness_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_document_id_source_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_chunks_document_chunk_idx" ON "source_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "source_chunks_user_topic_idx" ON "source_chunks" USING btree ("user_id","topic_slug","created_at","id");--> statement-breakpoint
CREATE INDEX "source_chunks_user_concept_idx" ON "source_chunks" USING btree ("user_id","concept_slug","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_chunks_user_content_hash_idx" ON "source_chunks" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE INDEX "source_chunks_lexical_idx" ON "source_chunks" USING gin (to_tsvector('english', "retrieval_text"));--> statement-breakpoint
CREATE INDEX "source_documents_user_topic_idx" ON "source_documents" USING btree ("user_id","topic_slug","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_user_normalized_hash_idx" ON "source_documents" USING btree ("user_id","normalized_content_hash");--> statement-breakpoint
CREATE INDEX "source_documents_canonical_url_idx" ON "source_documents" USING btree ("user_id","canonical_url");
