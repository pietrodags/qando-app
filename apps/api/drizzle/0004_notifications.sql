CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('summary', 'voting_closed');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"recipient" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notifications_event_type_unique" UNIQUE("event_id","type"),
	CONSTRAINT "notifications_sent_at_check" CHECK (("notifications"."status" = 'sent') = ("notifications"."sent_at" IS NOT NULL)),
	CONSTRAINT "notifications_attempts_check" CHECK ("notifications"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("scheduled_at") WHERE "notifications"."status" = 'pending';