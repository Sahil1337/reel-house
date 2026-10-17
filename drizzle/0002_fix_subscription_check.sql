-- Search (catalog.service searchContent) matches titles and names accent-insensitively.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
ALTER TABLE "subscription" DROP CONSTRAINT "subscription_dates_check";--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_dates_check" CHECK (("subscription"."status" IN ('PENDING', 'CANCELLED') AND "subscription"."start_date" IS NULL AND "subscription"."end_date" IS NULL) OR ("subscription"."start_date" IS NOT NULL AND "subscription"."end_date" > "subscription"."start_date"));