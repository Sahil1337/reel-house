/**
 * Who is signed in, and which of their profiles is being watched, for server pages.
 * The user comes from GET /api/auth/me (which verifies the signed session cookie); the profile
 * comes from the profileId cookie set by the picker and is honoured only if it belongs to that user.
 */
import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Profile, User } from "@/types";

import { serverApi } from "@/lib/api/server";
import { PROFILE_COOKIE } from "@/lib/constants";

/** The signed-in user, or null. Deduplicated per request. */
export const getCurrentUser = cache((): Promise<User | null> => serverApi.findMe());

/** For pages that need a user: the signed-in one, or a redirect to sign-in. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** For /admin pages: the signed-in admin. Signed out → sign-in; signed in without the role → /profiles. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/profiles");
  return user;
}

/** The selected profile, or null when there's no session, no cookie, or it isn't this user's. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()]);
  const profileId = Number(cookieStore.get(PROFILE_COOKIE)?.value);
  if (!user || !Number.isInteger(profileId) || profileId <= 0) return null;
  const profile = await serverApi.findProfile(profileId);
  return profile?.userId === user.userId ? profile : null;
});

/** For pages that need a profile: the selected one, or a redirect (sign-in first if signed out). */
export async function requireProfile(): Promise<Profile> {
  await requireUser();
  const profile = await getCurrentProfile();
  if (!profile) redirect("/profiles");
  return profile;
}
