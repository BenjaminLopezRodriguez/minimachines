CREATE TABLE "minimachines_exec" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"cmd" text NOT NULL,
	"cwd" varchar(512),
	"exitCode" integer NOT NULL,
	"stdout" text NOT NULL,
	"stderr" text NOT NULL,
	"durationMs" integer NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_job" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"ownerUserId" varchar(128) NOT NULL,
	"type" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"input" jsonb NOT NULL,
	"artifacts" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_machine_file" (
	"machineId" varchar(64) NOT NULL,
	"path" varchar(512) NOT NULL,
	"content" text NOT NULL,
	"bytes" integer NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "exec_machine_idx" ON "minimachines_exec" USING btree ("machineId");--> statement-breakpoint
CREATE INDEX "job_owner_idx" ON "minimachines_job" USING btree ("ownerUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_file_key_idx" ON "minimachines_machine_file" USING btree ("machineId","path");