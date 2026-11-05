CREATE TABLE "cancelled_events" (
	"public_id" text PRIMARY KEY NOT NULL,
	"results_id" text NOT NULL,
	"title" text NOT NULL,
	"cancelled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cancelled_events_results_id_unique" UNIQUE("results_id")
);
--> statement-breakpoint
CREATE TABLE "confirmations" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"option_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_option_same_event_fk" FOREIGN KEY ("option_id","event_id") REFERENCES "public"."options"("id","event_id") ON DELETE no action ON UPDATE no action;