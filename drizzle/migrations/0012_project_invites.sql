CREATE TABLE "minimachines_project_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"role" varchar(16) NOT NULL,
	"channel" varchar(8) NOT NULL,
	"contact" varchar(320) NOT NULL,
	"note" varchar(280),
	"codeRequired" boolean DEFAULT true NOT NULL,
	"codeHash" varchar(64),
	"codeExpiresAt" timestamp with time zone,
	"codeTries" integer DEFAULT 0 NOT NULL,
	"invitedBy" varchar(128) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"acceptedAt" timestamp with time zone,
	"acceptedBy" varchar(128),
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_project_member" (
	"projectId" uuid NOT NULL,
	"principal" varchar(128) NOT NULL,
	"role" varchar(16) NOT NULL,
	"invitedBy" varchar(128),
	"joinedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "minimachines_project_member_projectId_principal_pk" PRIMARY KEY("projectId","principal")
);
--> statement-breakpoint
CREATE TABLE "minimachines_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ownerUserId" varchar(128) NOT NULL,
	"name" varchar(128) NOT NULL,
	"repoKey" varchar(256),
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "minimachines_machine" ADD COLUMN "projectId" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "project_invite_token_idx" ON "minimachines_project_invite" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "project_invite_project_idx" ON "minimachines_project_invite" USING btree ("projectId");--> statement-breakpoint
CREATE INDEX "project_member_principal_idx" ON "minimachines_project_member" USING btree ("principal");--> statement-breakpoint
CREATE UNIQUE INDEX "project_owner_repo_idx" ON "minimachines_project" USING btree ("ownerUserId","repoKey");--> statement-breakpoint
CREATE UNIQUE INDEX "project_owner_name_idx" ON "minimachines_project" USING btree ("ownerUserId","name");--> statement-breakpoint
CREATE INDEX "machine_project_idx" ON "minimachines_machine" USING btree ("projectId");