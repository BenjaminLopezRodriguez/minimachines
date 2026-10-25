DROP INDEX "project_owner_name_idx";--> statement-breakpoint
ALTER TABLE "minimachines_project_invite" ADD COLUMN "codesSent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "minimachines_project_invite" ADD COLUMN "codeSentAt" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "project_owner_named_idx" ON "minimachines_project" USING btree ("ownerUserId","name") WHERE "repoKey" IS NULL;