/**
 * Profiles ("Who's watching?") and the genres picked in onboarding.
 *
 * Owns: profile (profile_id, user_id, name, avatar, maturity_level, onboarded_at) and
 * profile_genre_preference (profile_id, genre_id; PK (profile_id, genre_id)).
 * Column mapping: Profile.onboardingCompleted ⇔ `onboarded_at IS NOT NULL` (NULL until onboarding
 * is finished). Select it as `(onboarded_at IS NOT NULL) AS "onboardingCompleted"`.
 *
 * Exports:
 *   listProfiles(userId)                         — the account's profiles
 *   getOwnedProfile(userId, profileId)           — one profile, only if it belongs to the user
 *   createProfile(userId, input)                 — add a profile (limit 5, unique name)
 *   updateProfile(userId, profileId, changes)    — rename / avatar / maturity
 *   deleteProfile(userId, profileId)             — remove a profile and its activity
 *   getGenrePreferences(profileId)               — saved onboarding genre ids
 *   saveGenrePreferences(profileId, genreIds)    — replace the picks and finish onboarding
 */
import "server-only";

import { findProfile, getMockDb } from "@/server/mocks/db";
import { NotFoundError } from "@/server/errors";
import type { Profile, ProfileInput } from "@/types";

/**
 * The account's profiles, in creation order ("Who's watching?").
 *
 * Steps:
 *   1. Select every profile of the user, ordered by profile_id.
 * SQL:
 *   SELECT profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed
 *   FROM profile WHERE user_id = $1 ORDER BY profile_id;
 * Tables: profile  ·  Keys/constraints relied on: FK profile.user_id → users
 * Transaction: no  ·  Idempotent: yes (read-only)
 * Edge cases: never empty for a real account — sign-up creates the first profile.
 * Throws: nothing
 * Called by: GET /api/profiles
 * Mock today: the mock profiles whose userId matches, in file order.
 */
export async function listProfiles(userId: number): Promise<Profile[]> {
  // TODO: implement
  return getMockDb().profiles.filter((profile) => profile.userId === userId);
}

/**
 * The profile, only if it belongs to userId. A profile that exists but is someone else's is
 * reported exactly like a missing one — never reveal other accounts' profiles.
 *
 * Steps:
 *   1. Select by profile_id AND user_id; no row → NotFoundError.
 * SQL:
 *   SELECT profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed
 *   FROM profile WHERE profile_id = $1 AND user_id = $2;
 * Tables: profile  ·  Keys/constraints relied on: PK profile_pkey
 * Transaction: no  ·  Idempotent: yes (read-only)
 * Throws: NotFoundError 404 "Profile not found." when missing or not the user's
 * Called by: requireOwnedProfile / getSelectedProfile (src/app/api/_lib/auth.ts) → every
 *   /api/profiles/:profileId/** route, GET /api/profiles/:profileId
 * Mock today: finds the profile in data/mock/profiles.json and checks its userId.
 */
export async function getOwnedProfile(userId: number, profileId: number): Promise<Profile> {
  // TODO: implement
  const profile = findProfile(profileId);
  if (!profile || profile.userId !== userId) throw new NotFoundError("Profile not found.");
  return profile;
}

/**
 * Adds a profile to the account. The route has already validated the shape (name 1–24 chars after
 * trim, avatar ∈ AVATAR_KEYS, maturity ∈ KIDS | TEEN | ADULT). The client sends new profiles
 * through /onboarding afterwards, so onboarded_at starts NULL.
 *
 * Steps:
 *   1. Count the user's profiles; at MAX_PROFILES (5) → ConflictError.
 *   2. INSERT … RETURNING *. Names are unique per account, case-insensitively — the unique index
 *      violation (23505) → ConflictError.
 * SQL:
 *   SELECT COUNT(*) FROM profile WHERE user_id = $1;                    -- must be < 5
 *   INSERT INTO profile (user_id, name, avatar, maturity_level)
 *   VALUES ($1, $2, $3, $4)
 *   RETURNING profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed;
 * Tables: profile  ·  Keys/constraints relied on: UNIQUE INDEX profile_user_name_key
 *   (user_id, lower(name)); the 5-profile limit lives here, not in the schema (a trigger would also work)
 * Transaction: yes, so two concurrent creates can't both pass the count (lock the users row with
 *   SELECT … FOR UPDATE, or accept the small race)  ·  Idempotent: no
 * Edge cases: Profile.onboardingCompleted is false for the new row.
 * Throws: ConflictError 409 at the 5-profile limit (code "PROFILE_LIMIT"); ConflictError 409 when
 *   the name is already used on this account
 * Called by: POST /api/profiles
 * Mock today: returns `{ ...input, profileId: number of mock profiles + 1, userId,
 *   onboardingCompleted: false }` and persists nothing (the limit and name checks are not run).
 */
export async function createProfile(userId: number, input: ProfileInput): Promise<Profile> {
  // TODO: implement (MAX_PROFILES from "@/lib/constants" = 5 check, unique-name check)
  return {
    ...input,
    profileId: getMockDb().profiles.length + 1,
    userId,
    onboardingCompleted: false,
  };
}

/**
 * Renames a profile or changes its avatar or maturity. A lower maturity_level applies at once,
 * since every catalogue query filters by it.
 *
 * Steps:
 *   1. Confirm the profile belongs to userId (getOwnedProfile) → NotFoundError.
 *   2. UPDATE only the given columns … RETURNING *. When the name changes, uniqueness is checked
 *      excluding the row itself (renaming "Sam" to "sam" is fine); the unique index violation
 *      (23505) → ConflictError.
 * SQL:
 *   UPDATE profile
 *   SET name = COALESCE($3, name), avatar = COALESCE($4, avatar), maturity_level = COALESCE($5, maturity_level)
 *   WHERE profile_id = $1 AND user_id = $2
 *   RETURNING profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed;
 *   (build the SET list from the fields present in `changes`; $3–$5 are the given values)
 * Tables: profile  ·  Keys/constraints relied on: UNIQUE INDEX profile_user_name_key (user_id, lower(name))
 * Transaction: no (single statement)  ·  Idempotent: yes (same changes → same row)
 * Edge cases: empty `changes` just returns the current row; onboarded_at is never touched here.
 * Throws: NotFoundError 404 "Profile not found."; ConflictError 409 when the name is taken on this account
 * Called by: PATCH /api/profiles/:profileId
 * Mock today: merges `changes` into the found profile (keeping its ids) and persists nothing.
 */
export async function updateProfile(
  userId: number,
  profileId: number,
  changes: Partial<ProfileInput>,
): Promise<Profile> {
  // TODO: implement
  const profile = await getOwnedProfile(userId, profileId);
  return { ...profile, ...changes, profileId };
}

/**
 * Removes a profile and all of its activity. The route clears the profileId cookie if it pointed
 * at this profile.
 *
 * Steps:
 *   1. Confirm the profile belongs to userId (getOwnedProfile) → NotFoundError.
 *   2. Refuse when it is the user's only profile → ConflictError.
 *   3. DELETE the row; watch_history, my_list, rating and profile_genre_preference
 *      rows go with it through ON DELETE CASCADE.
 * SQL:
 *   SELECT COUNT(*) FROM profile WHERE user_id = $1;                    -- must be > 1
 *   DELETE FROM profile WHERE profile_id = $1 AND user_id = $2;
 * Tables: profile (cascades to watch_history, my_list, rating, profile_genre_preference)
 *   ·  Keys/constraints relied on: ON DELETE CASCADE on every profile_id foreign key
 * Transaction: yes (count + delete, so two concurrent deletes can't both pass the check)
 *   ·  Idempotent: no (a second delete is a 404)
 * Edge cases: deleting the profile the user is currently watching as is the route's cookie concern.
 * Throws: NotFoundError 404 "Profile not found."; ConflictError 409 when it's the account's last profile
 * Called by: DELETE /api/profiles/:profileId
 * Mock today: does nothing (the profile stays in the mock data).
 */
export async function deleteProfile(userId: number, profileId: number): Promise<void> {
  // TODO: implement
  void userId;
  void profileId;
}

/**
 * The profile's saved onboarding genre picks, to pre-fill the onboarding screen.
 *
 * Steps:
 *   1. Select the genre ids for the profile (caller has already verified ownership).
 * SQL:
 *   SELECT genre_id FROM profile_genre_preference WHERE profile_id = $1 ORDER BY genre_id;
 * Tables: profile_genre_preference  ·  Keys/constraints relied on: PK (profile_id, genre_id)
 * Transaction: no  ·  Idempotent: yes (read-only)
 * Edge cases: empty array before onboarding.
 * Throws: nothing
 * Called by: GET /api/profiles/:profileId/onboarding
 * Mock today: genre ids of the mock preference rows for this profile.
 */
export async function getGenrePreferences(profileId: number): Promise<number[]> {
  // TODO: implement
  return getMockDb()
    .genrePreferences.filter((row) => row.profileId === profileId)
    .map((row) => row.genreId);
}

/**
 * Saves the cold-start genre picks and finishes onboarding (sets onboarded_at). Replaces earlier
 * picks. Cold-start effect: in the home feed each picked genre adds +2 to that genre's affinity;
 * with no other activity yet, Home is the picked genres' titles ranked by the popularity prior
 * (see recommendations.service and docs/schema/SCHEMA.md "Ranking").
 *
 * Steps:
 *   1. De-duplicate genreIds; require at least ONBOARDING_MIN_GENRES (3) distinct ids that all
 *      exist in genre → ValidationError.
 *   2. One transaction: delete the old picks, insert the new ones, stamp onboarded_at.
 * SQL:
 *   SELECT COUNT(*) FROM genre WHERE genre_id IN ($2, $3, ...);  -- one $n per id; must equal the distinct count
 *   DELETE FROM profile_genre_preference WHERE profile_id = $1;
 *   INSERT INTO profile_genre_preference (profile_id, genre_id) VALUES ($1, $2), ($1, $3), ...;  -- one row per id
 *   UPDATE profile SET onboarded_at = now() WHERE profile_id = $1
 *   RETURNING profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed;
 * Tables: profile_genre_preference, profile, genre  ·  Keys/constraints relied on: PK
 *   (profile_id, genre_id); FK genre_id → genre
 * Transaction: yes (db.transaction)  ·  Idempotent: yes (re-saving the same picks gives the same
 *   rows; onboarded_at is re-stamped)
 * Edge cases: duplicates in the input count once; unknown genre ids are a 422, not silently dropped.
 * Throws: ValidationError 422 when fewer than 3 distinct genres, or an id isn't a known genre
 * Called by: PUT /api/profiles/:profileId/onboarding
 * Mock today: returns the profile with onboardingCompleted true; persists nothing and doesn't
 *   validate the genre ids.
 */
export async function saveGenrePreferences(profileId: number, genreIds: number[]): Promise<Profile> {
  // TODO: implement (de-dupe, ONBOARDING_MIN_GENRES from "@/lib/constants" = 3 existing genres, transaction)
  void genreIds;
  const profile = findProfile(profileId);
  if (!profile) throw new NotFoundError("Profile not found.");
  return { ...profile, onboardingCompleted: true };
}
