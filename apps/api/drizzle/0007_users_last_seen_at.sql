-- When each account was last used: a session created or renewed. Every account already stored
-- counts as used now, at most a few weeks after its real last use, never recorded until now.
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;
