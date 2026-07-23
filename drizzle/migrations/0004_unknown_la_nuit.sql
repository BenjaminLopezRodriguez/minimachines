CREATE TABLE "minimachines_device_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userCode" varchar(16) NOT NULL,
	"deviceCodeHash" varchar(64) NOT NULL,
	"approvedUserId" varchar(128),
	"mintedKeyId" varchar(64),
	"consumedAt" timestamp with time zone,
	"deniedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "device_code_hash_idx" ON "minimachines_device_code" USING btree ("deviceCodeHash");--> statement-breakpoint
CREATE UNIQUE INDEX "device_code_user_idx" ON "minimachines_device_code" USING btree ("userCode");