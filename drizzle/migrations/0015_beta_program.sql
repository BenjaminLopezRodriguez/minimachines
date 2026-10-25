CREATE TABLE "minimachines_beta_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"userId" varchar(128),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"verifiedAt" timestamp with time zone,
	"role" varchar(80),
	"useCase" varchar(1000),
	"cohort" varchar(80),
	"feedbackConsent" boolean DEFAULT false NOT NULL,
	"reviewedBy" varchar(128),
	"reviewedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_beta_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar(128) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"message" varchar(3000) NOT NULL,
	"rating" integer,
	"surface" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_compute_reservation" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userId" varchar(128) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_request_bucket" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "beta_email_unique" ON "minimachines_beta_application" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "beta_user_unique" ON "minimachines_beta_application" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "beta_status_idx" ON "minimachines_beta_application" USING btree ("status");--> statement-breakpoint
CREATE INDEX "beta_feedback_created_idx" ON "minimachines_beta_feedback" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "compute_reservation_user_idx" ON "minimachines_compute_reservation" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "request_bucket_expiry_idx" ON "minimachines_request_bucket" USING btree ("expiresAt");
--> statement-breakpoint
-- Backfill legacy waitlist leads without inventing verification or approval.
INSERT INTO minimachines_beta_application (email, status, "createdAt")
SELECT lower(trim(email)), 'pending', min("createdAt")
FROM minimachines_waitlist GROUP BY lower(trim(email))
ON CONFLICT (email) DO NOTHING;
