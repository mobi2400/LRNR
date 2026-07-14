ALTER TABLE "api_idempotency_keys" ALTER COLUMN "status" SET DEFAULT 'processing';--> statement-breakpoint
ALTER TABLE "api_idempotency_keys" ADD COLUMN "response_status_code" integer;--> statement-breakpoint
CREATE INDEX "api_idempotency_keys_expires_at_idx" ON "api_idempotency_keys" USING btree ("expires_at");