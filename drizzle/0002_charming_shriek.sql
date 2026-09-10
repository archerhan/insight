ALTER TABLE "conclusion_items" ADD COLUMN "content_title" text;--> statement-breakpoint
ALTER TABLE "conclusion_items" ADD COLUMN "author_name" text;--> statement-breakpoint
UPDATE "conclusion_items" AS ci
SET "content_title" = c."content_title",
    "author_name" = u."display_name"
FROM "claims" AS c
LEFT JOIN "users" AS u ON u."id" = c."author_id"
WHERE ci."claim_id" = c."id";
