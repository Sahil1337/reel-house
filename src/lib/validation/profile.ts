/** Client-side form validation for the profile dialog. */
import { z } from "zod";

import { AVATAR_KEYS } from "@/lib/constants";

const maturityLevelSchema = z.enum(["KIDS", "TEEN", "ADULT"]);

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Give the profile a name.").max(24, "Keep names under 24 characters."),
  avatar: z.enum(AVATAR_KEYS as [string, ...string[]]).transform((value) => value as (typeof AVATAR_KEYS)[number]),
  maturityLevel: maturityLevelSchema,
});
