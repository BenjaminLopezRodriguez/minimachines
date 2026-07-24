CREATE TABLE "minimachines_share" (
	"slug" varchar(32) PRIMARY KEY NOT NULL,
	"ownerUserId" varchar(128) NOT NULL,
	"originKind" varchar(16) NOT NULL,
	"originUrl" text NOT NULL,
	"machineId" varchar(64),
	"port" integer,
	"label" varchar(128) DEFAULT '' NOT NULL,
	"kind" varchar(16) DEFAULT 'website' NOT NULL,
	"access" varchar(16) DEFAULT 'public' NOT NULL,
	"secretHash" varchar(64),
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"lastUsedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "minimachines_machine" ADD COLUMN "ports" jsonb;--> statement-breakpoint
CREATE INDEX "share_owner_idx" ON "minimachines_share" USING btree ("ownerUserId");