CREATE TABLE "minimachines_partner_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" varchar(200) NOT NULL,
	"email" varchar(320) NOT NULL,
	"agentName" varchar(200),
	"note" text,
	"createdAt" timestamp with time zone NOT NULL
);
