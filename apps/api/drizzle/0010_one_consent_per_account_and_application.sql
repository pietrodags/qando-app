-- One consent per account and application. Two answers of the consent page sent at once could
-- both find none and both store one: a second one would be listed beside the first, and
-- withdrawing one would leave the application allowed by the other. Where an account holds
-- several for the same application, the one of its latest answer is kept, with that answer's
-- permissions; then the database refuses a second one. The new index also finds an account's
-- consents, as the one it replaces did.
DELETE FROM "oauth_consents"
WHERE "id" IN (
	SELECT "id" FROM (
		SELECT "id", row_number() OVER (
			PARTITION BY "user_id", "client_id"
			ORDER BY "updated_at" DESC NULLS LAST, "created_at" DESC NULLS LAST, "id" DESC
		) AS "rank"
		FROM "oauth_consents"
		WHERE "user_id" IS NOT NULL
	) AS "ranked"
	WHERE "rank" > 1
);--> statement-breakpoint
DROP INDEX "oauth_consents_user_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_consents_user_client_unique" ON "oauth_consents" USING btree ("user_id","client_id");
