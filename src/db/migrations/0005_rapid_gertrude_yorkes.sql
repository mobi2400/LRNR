CREATE TABLE "claim_sources" (
	"user_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"support_type" text DEFAULT 'supports' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_sources_pk" PRIMARY KEY("claim_id","chunk_id")
);
--> statement-breakpoint
CREATE TABLE "contradiction_claims" (
	"user_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"contradicts_claim_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contradiction_claims_pk" PRIMARY KEY("claim_id","contradicts_claim_id")
);
--> statement-breakpoint
CREATE TABLE "source_chunk_concepts" (
	"user_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"concept_slug" text NOT NULL,
	"relation_type" text DEFAULT 'mentions' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_chunk_concepts_pk" PRIMARY KEY("chunk_id","concept_slug")
);
--> statement-breakpoint
CREATE TABLE "source_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid,
	"chunk_id" uuid,
	"claim_text" text NOT NULL,
	"claim_hash" text NOT NULL,
	"confidence" numeric(5, 4) DEFAULT '0.8000' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_sources" ADD CONSTRAINT "claim_sources_claim_id_source_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."source_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_sources" ADD CONSTRAINT "claim_sources_chunk_id_source_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."source_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contradiction_claims" ADD CONSTRAINT "contradiction_claims_claim_id_source_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."source_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contradiction_claims" ADD CONSTRAINT "contradiction_claims_contradicts_claim_id_source_claims_id_fk" FOREIGN KEY ("contradicts_claim_id") REFERENCES "public"."source_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunk_concepts" ADD CONSTRAINT "source_chunk_concepts_chunk_id_source_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."source_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_claims" ADD CONSTRAINT "source_claims_document_id_source_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_claims" ADD CONSTRAINT "source_claims_chunk_id_source_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."source_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_sources_user_claim_idx" ON "claim_sources" USING btree ("user_id","claim_id");--> statement-breakpoint
CREATE INDEX "contradiction_claims_user_claim_idx" ON "contradiction_claims" USING btree ("user_id","claim_id");--> statement-breakpoint
CREATE INDEX "source_chunk_concepts_user_concept_idx" ON "source_chunk_concepts" USING btree ("user_id","concept_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "source_claims_user_claim_hash_idx" ON "source_claims" USING btree ("user_id","claim_hash");--> statement-breakpoint
CREATE INDEX "source_claims_user_document_idx" ON "source_claims" USING btree ("user_id","document_id");