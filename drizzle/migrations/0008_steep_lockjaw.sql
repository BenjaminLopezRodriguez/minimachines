CREATE TABLE "minimachines_mailbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"ownerUserId" varchar(128) NOT NULL,
	"eventId" uuid,
	"body" text NOT NULL,
	"model" varchar(64),
	"imageUrl" varchar(512),
	"deliveredAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_pager_contact" (
	"ownerUserId" varchar(128) PRIMARY KEY NOT NULL,
	"email" varchar(320),
	"phone" varchar(32),
	"emailVerifiedAt" timestamp with time zone,
	"phoneVerifiedAt" timestamp with time zone,
	"channels" varchar(16) DEFAULT 'email' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_pager_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"ownerUserId" varchar(128) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"text" text NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"consumedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mailbox_poll_idx" ON "minimachines_mailbox" USING btree ("machineId","deliveredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "pager_event_token_idx" ON "minimachines_pager_event" USING btree ("tokenHash");