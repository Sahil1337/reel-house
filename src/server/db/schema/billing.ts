import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { paymentMode, paymentStatus, subscriptionStatus } from "./enums";
import { users } from "./accounts";

export const subscriptionPlan = pgTable(
  "subscription_plan",
  {
    planId: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 50 }).notNull().unique(),
    priceMonthly: numeric({ precision: 10, scale: 2 }).notNull(),
    videoQuality: varchar({ length: 10 }).notNull(), // '720p', '1080p', '4K'
    maxDevices: smallint().notNull(),
  },
  (t) => [
    check("subscription_plan_price_monthly_check", sql`${t.priceMonthly} >= 0`),
    check("subscription_plan_max_devices_check", sql`${t.maxDevices} > 0`),
  ],
);

export const subscription = pgTable(
  "subscription",
  {
    subscriptionId: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    planId: integer()
      .notNull()
      .references(() => subscriptionPlan.planId, { onDelete: "restrict" }),
    startDate: timestamp({ withTimezone: true }), // NULL while PENDING
    endDate: timestamp({ withTimezone: true }),
    status: subscriptionStatus().notNull().default("PENDING"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Never-paid checkouts (PENDING, or CANCELLED before payment) have no dates; anything that was paid has both.
    check(
      "subscription_dates_check",
      sql`(${t.status} IN ('PENDING', 'CANCELLED') AND ${t.startDate} IS NULL AND ${t.endDate} IS NULL) OR (${t.startDate} IS NOT NULL AND ${t.endDate} > ${t.startDate})`,
    ),
    // One ACTIVE subscription per user at a time.
    uniqueIndex("subscription_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

export const payment = pgTable(
  "payment",
  {
    paymentId: integer().primaryKey().generatedAlwaysAsIdentity(),
    subscriptionId: integer()
      .notNull()
      .references(() => subscription.subscriptionId, { onDelete: "restrict" }),
    paymentDate: timestamp({ withTimezone: true }).notNull().defaultNow(),
    amount: numeric({ precision: 10, scale: 2 }).notNull(),
    paymentMode: paymentMode().notNull(),
    transactionRef: varchar({ length: 64 }).notNull().unique("payment_transaction_ref_key"), // Razorpay pay_… id
    gatewayOrderId: varchar({ length: 64 }).notNull(), // Razorpay order_… id
    status: paymentStatus().notNull(),
  },
  (t) => [
    check("payment_amount_check", sql`${t.amount} > 0`),
    index("payment_subscription_idx").on(t.subscriptionId, t.paymentDate.desc().nullsFirst()),
  ],
);

export const subscriptionPlanRelations = relations(subscriptionPlan, ({ many }) => ({
  subscriptions: many(subscription),
}));

export const subscriptionRelations = relations(subscription, ({ one, many }) => ({
  user: one(users, {
    fields: [subscription.userId],
    references: [users.userId],
  }),
  plan: one(subscriptionPlan, {
    fields: [subscription.planId],
    references: [subscriptionPlan.planId],
  }),
  payments: many(payment),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  subscription: one(subscription, {
    fields: [payment.subscriptionId],
    references: [subscription.subscriptionId],
  }),
}));
