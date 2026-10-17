/** Client-side helper for the profileId cookie that server pages read (see src/server/session/current-session.ts). */
import { PROFILE_COOKIE } from "@/lib/constants";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Sign-out clears it on the server (POST /api/auth/sign-out). */
export function setProfileCookie(profileId: number): void {
  document.cookie = `${PROFILE_COOKIE}=${profileId}; path=/; max-age=${THIRTY_DAYS}; samesite=lax`;
}
