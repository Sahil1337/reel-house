import type { AvatarKey, PaymentMode } from "@/types";

/** httpOnly cookie holding the signed session token (see src/server/auth/session-token.ts). */
export const SESSION_COOKIE = "session";

/** Holds the selected profile id; set by the profile picker, read by server pages. */
export const PROFILE_COOKIE = "profileId";

/** Profile limit for an account with no current plan; otherwise subscription_plan.max_profiles decides. */
export const NO_PLAN_MAX_PROFILES = 1;

/** Onboarding asks for at least this many genres. */
export const ONBOARDING_MIN_GENRES = 3;

/** A title counts as finished once progress reaches this percentage. */
export const COMPLETED_THRESHOLD = 90;

export const AVATAR_KEYS: AvatarKey[] = ["lamp", "reel", "ticket", "clapper", "star", "mask", "popcorn", "camera"];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  CARD: "Card",
  UPI: "UPI",
  NET_BANKING: "Net banking",
  WALLET: "Wallet",
};

export const TMDB_ATTRIBUTION = "This product uses the TMDB API but is not endorsed or certified by TMDB.";
