CREATE TABLE "minimachines_bot_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"botId" uuid NOT NULL,
	"ownerUserId" varchar(128) NOT NULL,
	"title" varchar(160) DEFAULT 'New conversation' NOT NULL,
	"generationId" uuid,
	"generationStartedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_bot_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversationId" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"replyTo" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimachines_bot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ownerUserId" varchar(128) NOT NULL,
	"machineId" varchar(64) NOT NULL,
	"name" varchar(80) NOT NULL,
	"instructions" text NOT NULL,
	"provider" varchar(16) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "minimachines_bot_conversation" ADD CONSTRAINT "minimachines_bot_conversation_botId_minimachines_bot_id_fk" FOREIGN KEY ("botId") REFERENCES "public"."minimachines_bot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minimachines_bot_message" ADD CONSTRAINT "minimachines_bot_message_conversationId_minimachines_bot_conversation_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."minimachines_bot_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_conversation_owner_idx" ON "minimachines_bot_conversation" USING btree ("ownerUserId","botId");--> statement-breakpoint
CREATE INDEX "bot_message_conversation_idx" ON "minimachines_bot_message" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_message_reply_idx" ON "minimachines_bot_message" USING btree ("replyTo");--> statement-breakpoint
CREATE INDEX "bot_owner_idx" ON "minimachines_bot" USING btree ("ownerUserId");