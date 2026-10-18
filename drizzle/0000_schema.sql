CREATE TYPE "public"."content_type" AS ENUM('MOVIE', 'SERIES');--> statement-breakpoint
CREATE TYPE "public"."credit_role" AS ENUM('ACTOR', 'DIRECTOR');--> statement-breakpoint
CREATE TYPE "public"."maturity_level" AS ENUM('KIDS', 'TEEN', 'ADULT');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('CARD', 'UPI', 'NET_BANKING', 'WALLET');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('SUCCESS', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."rec_status" AS ENUM('SHOWN', 'CLICKED', 'WATCHED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('PENDING', 'ACTIVE', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "profile" (
	"profile_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "profile_profile_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" varchar(24) NOT NULL,
	"avatar" varchar(20) NOT NULL,
	"maturity_level" "maturity_level" DEFAULT 'ADULT' NOT NULL,
	"onboarded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profile_genre_preference" (
	"profile_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "profile_genre_preference_profile_id_genre_id_pk" PRIMARY KEY("profile_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"phone" varchar(20),
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"payment_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subscription_id" integer NOT NULL,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_mode" "payment_mode" NOT NULL,
	"transaction_ref" varchar(64) NOT NULL,
	"gateway_order_id" varchar(64) NOT NULL,
	"status" "payment_status" NOT NULL,
	CONSTRAINT "payment_transaction_ref_key" UNIQUE("transaction_ref"),
	CONSTRAINT "payment_amount_check" CHECK ("payment"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"subscription_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscription_subscription_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" "subscription_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_dates_check" CHECK (("subscription"."status" IN ('PENDING', 'CANCELLED') AND "subscription"."start_date" IS NULL AND "subscription"."end_date" IS NULL) OR ("subscription"."start_date" IS NOT NULL AND "subscription"."end_date" > "subscription"."start_date"))
);
--> statement-breakpoint
CREATE TABLE "subscription_plan" (
	"plan_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscription_plan_plan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(50) NOT NULL,
	"price_monthly" numeric(10, 2) NOT NULL,
	"video_quality" varchar(10) NOT NULL,
	"max_devices" smallint NOT NULL,
	CONSTRAINT "subscription_plan_name_unique" UNIQUE("name"),
	CONSTRAINT "subscription_plan_price_monthly_check" CHECK ("subscription_plan"."price_monthly" >= 0),
	CONSTRAINT "subscription_plan_max_devices_check" CHECK ("subscription_plan"."max_devices" > 0)
);
--> statement-breakpoint
CREATE TABLE "content" (
	"content_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content_content_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"content_type" "content_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"release_date" date,
	"duration_minutes" smallint,
	"age_rating" varchar(10),
	"poster_url" text,
	"backdrop_url" text,
	CONSTRAINT "content_title_type_release_key" UNIQUE NULLS NOT DISTINCT("title","content_type","release_date"),
	CONSTRAINT "content_duration_minutes_check" CHECK ("content"."duration_minutes" > 0),
	CONSTRAINT "content_movie_duration_check" CHECK ("content"."content_type" = 'MOVIE' OR "content"."duration_minutes" IS NULL),
	CONSTRAINT "content_age_rating_check" CHECK ("content"."age_rating" IN ('G', 'PG', 'PG-13', 'R', 'NC-17', 'NR', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'))
);
--> statement-breakpoint
CREATE TABLE "content_credit" (
	"content_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"role" "credit_role" NOT NULL,
	"character_name" varchar(255),
	"credit_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "content_credit_content_id_person_id_role_pk" PRIMARY KEY("content_id","person_id","role"),
	CONSTRAINT "content_credit_character_check" CHECK ("content_credit"."role" = 'ACTOR' OR "content_credit"."character_name" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "content_genre" (
	"content_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "content_genre_content_id_genre_id_pk" PRIMARY KEY("content_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "episode" (
	"episode_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "episode_episode_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"episode_number" smallint NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"release_date" date,
	"duration_minutes" smallint,
	"still_url" text,
	CONSTRAINT "episode_season_number_key" UNIQUE("season_id","episode_number"),
	CONSTRAINT "episode_episode_number_check" CHECK ("episode"."episode_number" > 0),
	CONSTRAINT "episode_duration_minutes_check" CHECK ("episode"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "genre" (
	"genre_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "genre_genre_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(50) NOT NULL,
	CONSTRAINT "genre_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"person_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "person_person_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"date_of_birth" date,
	"photo_url" text,
	CONSTRAINT "person_name_dob_key" UNIQUE NULLS NOT DISTINCT("name","date_of_birth")
);
--> statement-breakpoint
CREATE TABLE "season" (
	"season_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "season_season_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"content_id" integer NOT NULL,
	"season_number" smallint NOT NULL,
	"name" varchar(255) NOT NULL,
	"release_date" date,
	CONSTRAINT "season_content_number_key" UNIQUE("content_id","season_number"),
	CONSTRAINT "season_season_number_check" CHECK ("season"."season_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "my_list" (
	"profile_id" integer NOT NULL,
	"content_id" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "my_list_profile_id_content_id_pk" PRIMARY KEY("profile_id","content_id")
);
--> statement-breakpoint
CREATE TABLE "rating" (
	"profile_id" integer NOT NULL,
	"content_id" integer NOT NULL,
	"value" smallint NOT NULL,
	"rated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_profile_id_content_id_pk" PRIMARY KEY("profile_id","content_id"),
	CONSTRAINT "rating_value_check" CHECK ("rating"."value" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "watch_history" (
	"history_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "watch_history_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_id" integer NOT NULL,
	"content_id" integer NOT NULL,
	"episode_id" integer,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"progress_percent" smallint NOT NULL,
	CONSTRAINT "watch_history_profile_content_episode_key" UNIQUE NULLS NOT DISTINCT("profile_id","content_id","episode_id"),
	CONSTRAINT "watch_history_progress_percent_check" CHECK ("watch_history"."progress_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "recommendation" (
	"profile_id" integer NOT NULL,
	"content_id" integer NOT NULL,
	"row_type" varchar(30) NOT NULL,
	"relevance_score" real NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rec_status" "rec_status" DEFAULT 'SHOWN' NOT NULL,
	CONSTRAINT "recommendation_profile_id_content_id_pk" PRIMARY KEY("profile_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_genre_preference" ADD CONSTRAINT "profile_genre_preference_profile_id_profile_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_genre_preference" ADD CONSTRAINT "profile_genre_preference_genre_id_genre_genre_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("genre_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscription_id_subscription_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_subscription_plan_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plan"("plan_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_credit" ADD CONSTRAINT "content_credit_content_id_content_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_credit" ADD CONSTRAINT "content_credit_person_id_person_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("person_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_genre" ADD CONSTRAINT "content_genre_content_id_content_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_genre" ADD CONSTRAINT "content_genre_genre_id_genre_genre_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("genre_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_season_id_season_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("season_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_content_id_content_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "my_list" ADD CONSTRAINT "my_list_profile_id_profile_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "my_list" ADD CONSTRAINT "my_list_content_id_content_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_profile_id_profile_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_content_id_content_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_profile_id_profile_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_content_id_content_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_episode_id_episode_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("episode_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_profile_id_profile_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_content_id_content_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("content_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_user_name_key" ON "profile" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "payment_subscription_idx" ON "payment" USING btree ("subscription_id","payment_date" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_one_active_per_user" ON "subscription" USING btree ("user_id") WHERE "subscription"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "content_credit_person_idx" ON "content_credit" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "content_genre_genre_idx" ON "content_genre" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "rating_content_idx" ON "rating" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "watch_history_recent_idx" ON "watch_history" USING btree ("profile_id","watched_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "recommendation_rank_idx" ON "recommendation" USING btree ("profile_id","relevance_score" DESC NULLS FIRST);--> statement-breakpoint
-- Maturity is derived from the certificate whenever a query needs it, never stored.
-- Catalogue queries filter with  maturity_of(c.age_rating) <= p.maturity_level  (enum order).
CREATE FUNCTION maturity_of(code VARCHAR) RETURNS maturity_level
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
           WHEN code IN ('G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG') THEN 'KIDS'
           WHEN code IN ('PG-13', 'TV-14')                           THEN 'TEEN'
           WHEN code IN ('R', 'NC-17', 'NR', 'TV-MA')                THEN 'ADULT'
           ELSE 'TEEN'                                               -- NULL: no certificate
         END::maturity_level
$$;
--> statement-breakpoint
-- Search (catalog.service searchContent) matches titles and names accent-insensitively.
CREATE EXTENSION IF NOT EXISTS unaccent;
