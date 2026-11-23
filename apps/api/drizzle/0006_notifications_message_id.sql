-- Each email's Message-ID, the same each time it is sent again; every email already queued gets
-- one of its own (the default is drawn for each row).
ALTER TABLE "notifications" ADD COLUMN "message_id" uuid DEFAULT gen_random_uuid() NOT NULL;