CREATE TABLE "minimachines_push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ownerUserId" varchar(128) NOT NULL,
	"kind" varchar(16) DEFAULT 'webpush' NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" varchar(256) NOT NULL,
	"auth" varchar(128) NOT NULL,
	"ua" varchar(256),
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_idx" ON "minimachines_push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_owner_idx" ON "minimachines_push_subscription" USING btree ("ownerUserId");