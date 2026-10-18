/**
 * Zod schemas for the admin forms and the /api/admin/** routes (the same schema validates the form in
 * the browser and the request on the server). Each mirrors the column rules in docs/schema/SCHEMA.md.
 */
import { z } from "zod";

/** content.age_rating CHECK list (US certificates). */
export const AGE_RATINGS = [
  "G",
  "PG",
  "PG-13",
  "R",
  "NC-17",
  "NR",
  "TV-Y",
  "TV-Y7",
  "TV-G",
  "TV-PG",
  "TV-14",
  "TV-MA",
] as const;

/** subscription_plan.video_quality codes. */
export const VIDEO_QUALITIES = ["720p", "1080p", "4K"] as const;

export const SUBSCRIPTION_STATUSES = ["ACTIVE", "CANCELLED", "EXPIRED", "PENDING"] as const;

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 100;

/** Longest extension an admin can grant in one go. */
export const MAX_EXTEND_MONTHS = 24;

/** "" and missing become undefined, so `?q=&type=` behaves like no filter. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

const nullableUrl = z
  .string()
  .trim()
  .max(500, "Keep it under 500 characters.")
  .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), "Enter a full http(s) URL.")
  .transform((value) => (value === "" ? null : value))
  .nullable();

const pageSchema = optional(z.coerce.number().int().min(1));
const pageSizeSchema = optional(z.coerce.number().int().min(1).max(ADMIN_MAX_PAGE_SIZE));

// ─── Content ─────────────────────────────────────────────────────────────────

/** GET /api/admin/content query string. */
export const adminContentQuerySchema = z.object({
  q: optional(z.string().trim().max(200)),
  type: optional(z.enum(["MOVIE", "SERIES"])),
  genre: optional(z.coerce.number().int().positive()),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

/** PATCH /api/admin/content/:contentId body and the "Edit details" form. */
export const updateContentSchema = z
  .object({
    title: z.string().trim().min(1, "A title is required.").max(255, "Keep the title under 255 characters."),
    description: z.string().trim().max(5000, "Keep the description under 5000 characters."),
    releaseDate: z
      .string()
      .trim()
      .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use the YYYY-MM-DD format.")
      .transform((value) => (value === "" ? null : value))
      .nullable(),
    ageRating: z.enum(AGE_RATINGS, { error: `Pick one of ${AGE_RATINGS.join(", ")}.` }).nullable(),
    posterUrl: nullableUrl,
    backdropUrl: nullableUrl,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Send at least one field to change.");

/** The edit form always sends every field. */
export type UpdateContentFormValues = z.input<typeof updateContentSchema>;

// ─── Plans ───────────────────────────────────────────────────────────────────

/** subscription_plan: name UNIQUE (409 from the service), price_monthly >= 0, max_devices > 0. */
export const planSchema = z.object({
  name: z.string().trim().min(1, "Give the plan a name.").max(50, "Keep names under 50 characters."),
  priceMonthly: z.coerce
    .number({ error: "Enter a price." })
    .min(0, "The price can't be negative.")
    .max(99_999_999, "That price is too large.")
    .multipleOf(0.01, "Use at most two decimal places."),
  videoQuality: z.enum(VIDEO_QUALITIES, { error: "Pick a video quality." }),
  maxDevices: z.coerce
    .number({ error: "Enter the number of devices." })
    .int("Use a whole number.")
    .min(1, "At least one device.")
    .max(32_767, "That's more than the column holds."),
});

export type PlanFormValues = z.input<typeof planSchema>;

/** PATCH /api/admin/plans/:planId: every field optional, at least one present. */
export const updatePlanSchema = planSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Send at least one field to change.");

// ─── Subscriptions ───────────────────────────────────────────────────────────

/** GET /api/admin/subscriptions query string. */
export const adminSubscriptionQuerySchema = z.object({
  status: optional(z.enum(SUBSCRIPTION_STATUSES)),
  q: optional(z.string().trim().max(200)),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const extendMonthsSchema = z.coerce
  .number({ error: "Enter a number of months." })
  .int("Use whole months.")
  .min(1, "Extend by at least 1 month.")
  .max(MAX_EXTEND_MONTHS, `Extend by at most ${MAX_EXTEND_MONTHS} months at a time.`);

/** PATCH /api/admin/subscriptions/:subscriptionId body. */
export const subscriptionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("extend"), months: extendMonthsSchema }),
  z.object({ action: z.literal("change_plan"), planId: z.coerce.number().int().positive() }),
]);
