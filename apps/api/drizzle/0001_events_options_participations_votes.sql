CREATE TYPE "public"."event_state" AS ENUM('open', 'closed', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."vote_state" AS ENUM('available', 'preferred', 'unavailable');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"results_id" text NOT NULL,
	"management_token_hash" text NOT NULL,
	"organizer_name" text NOT NULL,
	"organizer_email" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"time_zone" text NOT NULL,
	"deadline" date NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"anonymous" boolean NOT NULL,
	"state" "event_state" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "events_results_id_unique" UNIQUE("results_id"),
	CONSTRAINT "events_management_token_hash_unique" UNIQUE("management_token_hash")
);
--> statement-breakpoint
CREATE TABLE "options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"start_time" time,
	"end_time" time,
	CONSTRAINT "options_id_event_unique" UNIQUE("id","event_id"),
	CONSTRAINT "options_unique_position" UNIQUE("event_id","position"),
	CONSTRAINT "options_unique_slot" UNIQUE NULLS NOT DISTINCT("event_id","start_date","end_date","start_time","end_time"),
	CONSTRAINT "options_date_range" CHECK ("options"."end_date" IS NULL OR "options"."end_date" > "options"."start_date"),
	CONSTRAINT "options_time_range" CHECK ("options"."end_time" IS NULL OR ("options"."start_time" IS NOT NULL AND "options"."end_time" > "options"."start_time")),
	CONSTRAINT "options_times_on_single_date" CHECK ("options"."end_date" IS NULL OR ("options"."start_time" IS NULL AND "options"."end_time" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "participations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text,
	"edit_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participations_edit_token_hash_unique" UNIQUE("edit_token_hash"),
	CONSTRAINT "participations_id_event_unique" UNIQUE("id","event_id")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"participation_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"state" "vote_state" NOT NULL,
	CONSTRAINT "votes_pkey" PRIMARY KEY("participation_id","option_id")
);
--> statement-breakpoint
ALTER TABLE "options" ADD CONSTRAINT "options_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_participation_same_event_fk" FOREIGN KEY ("participation_id","event_id") REFERENCES "public"."participations"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_option_same_event_fk" FOREIGN KEY ("option_id","event_id") REFERENCES "public"."options"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "votes_one_preferred" ON "votes" USING btree ("participation_id") WHERE "votes"."state" = 'preferred';--> statement-breakpoint
CREATE INDEX "votes_option_event_idx" ON "votes" USING btree ("option_id","event_id");