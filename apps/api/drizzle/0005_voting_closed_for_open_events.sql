-- The "voting closed" email of each event whose voting is still open, queued for a minute after
-- its closing, as creating an event queues it. An event whose voting closed before is left
-- without it: an email saying voting has closed would arrive days late.
INSERT INTO "notifications" ("event_id", "type", "recipient", "scheduled_at")
SELECT "id", 'voting_closed', "organizer_email", "closes_at" + interval '1 minute'
FROM "events"
WHERE "state" = 'open' AND "closes_at" > now()
ON CONFLICT ("event_id", "type") DO NOTHING;
