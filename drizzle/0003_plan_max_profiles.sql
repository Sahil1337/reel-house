-- Existing plans keep the old global limit of 5; new plans must set it explicitly.
ALTER TABLE "subscription_plan" ADD COLUMN "max_profiles" smallint NOT NULL DEFAULT 5;--> statement-breakpoint
ALTER TABLE "subscription_plan" ALTER COLUMN "max_profiles" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription_plan" ADD CONSTRAINT "subscription_plan_max_profiles_check" CHECK ("subscription_plan"."max_profiles" > 0);
