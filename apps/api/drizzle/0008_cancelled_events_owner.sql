-- The account that owned a cancelled event, so deleting the account deletes what is left of it.
-- The events cancelled before have none and are deleted 6 months after their cancellation.
ALTER TABLE "cancelled_events" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "cancelled_events" ADD CONSTRAINT "cancelled_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cancelled_events_owner_id_idx" ON "cancelled_events" USING btree ("owner_id");