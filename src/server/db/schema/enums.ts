import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["USER", "ADMIN"]);
// Declared order matters: KIDS < TEEN < ADULT.
export const maturityLevel = pgEnum("maturity_level", ["KIDS", "TEEN", "ADULT"]);
export const contentType = pgEnum("content_type", ["MOVIE", "SERIES"]);
export const creditRole = pgEnum("credit_role", ["ACTOR", "DIRECTOR"]);
export const subscriptionStatus = pgEnum("subscription_status", ["PENDING", "ACTIVE", "CANCELLED", "EXPIRED"]);
export const paymentMode = pgEnum("payment_mode", ["CARD", "UPI", "NET_BANKING", "WALLET"]);
export const paymentStatus = pgEnum("payment_status", ["SUCCESS", "FAILED", "REFUNDED"]);
