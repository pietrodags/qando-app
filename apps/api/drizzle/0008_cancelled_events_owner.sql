-- The account that owned a cancelled event, so deleting the account deletes what is left of it.
-- No foreign key: cancelling never waits for an account being deleted; the account's deletion
-- deletes these by owner. The events cancelled before have none and are deleted 6 months after
-- their cancellation.
ALTER TABLE "cancelled_events" ADD COLUMN "owner_id" text;--> statement-breakpoint
CREATE INDEX "cancelled_events_owner_id_idx" ON "cancelled_events" USING btree ("owner_id");