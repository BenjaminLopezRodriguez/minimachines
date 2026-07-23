CREATE TABLE "minimachines_api_key" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userId" varchar(128) NOT NULL,
	"keyHash" varchar(64) NOT NULL,
	"keyPrefix" varchar(16) NOT NULL,
	"label" varchar(128) NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "minimachines_machine" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"title" varchar(200) NOT NULL,
	"agent" varchar(64) NOT NULL,
	"task" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"region" varchar(64) NOT NULL,
	"cpu" integer NOT NULL,
	"memoryGb" integer NOT NULL,
	"uptime" varchar(64) NOT NULL,
	"lastActive" varchar(64) NOT NULL,
	"templateId" varchar(128),
	"dockerfile" varchar(256),
	"emulatorUrl" varchar(512),
	"ownerUserId" varchar(128),
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_idx" ON "minimachines_api_key" USING btree ("keyHash");--> statement-breakpoint
CREATE INDEX "api_key_user_idx" ON "minimachines_api_key" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "machine_owner_idx" ON "minimachines_machine" USING btree ("ownerUserId");