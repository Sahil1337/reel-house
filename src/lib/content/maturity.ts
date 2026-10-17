import type { MaturityLevel } from "@/types";

export const MATURITY_ORDER: Record<MaturityLevel, number> = {
  KIDS: 0,
  TEEN: 1,
  ADULT: 2,
};

export const MATURITY_LABELS: Record<MaturityLevel, string> = {
  KIDS: "Kids",
  TEEN: "Teen",
  ADULT: "All maturity ratings",
};

/** Can a profile at `profileLevel` see content rated `contentLevel`? (SQL: maturity_of(c.age_rating) <= p.maturity_level) */
export function isAllowedFor(profileLevel: MaturityLevel, contentLevel: MaturityLevel): boolean {
  return MATURITY_ORDER[contentLevel] <= MATURITY_ORDER[profileLevel];
}
