CREATE TABLE "minimachines_organization_member" (
	"orgId" uuid NOT NULL,
	"userId" varchar(128) NOT NULL,
	"role" varchar(16) NOT NULL,
	"invitedBy" varchar(128),
	"joinedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "minimachines_organization_member_orgId_userId_pk" PRIMARY KEY("orgId","userId")
);
--> statement-breakpoint
CREATE TABLE "minimachines_organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"ownerUserId" varchar(128) NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_user_secret" (
	"userId" varchar(128) NOT NULL,
	"name" varchar(64) NOT NULL,
	"ciphertext" text NOT NULL,
	"lastFour" varchar(4) NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "minimachines_user_secret_userId_name_pk" PRIMARY KEY("userId","name")
);
--> statement-breakpoint
ALTER TABLE "minimachines_project_invite" ALTER COLUMN "projectId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "minimachines_project_invite" ADD COLUMN "orgId" uuid;--> statement-breakpoint
CREATE INDEX "organization_member_user_idx" ON "minimachines_organization_member" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "project_invite_org_idx" ON "minimachines_project_invite" USING btree ("orgId");--> statement-breakpoint
ALTER TABLE "minimachines_project_invite" ADD CONSTRAINT "project_invite_one_target" CHECK (("projectId" IS NULL) <> ("orgId" IS NULL));