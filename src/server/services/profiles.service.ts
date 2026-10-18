/**
 * Profiles ("Who's watching?") and the genres picked in onboarding.
 *
 * Owns: profile (profile_id, user_id, name, avatar, maturity_level, onboarded_at) and
 * profile_genre_preference (profile_id, genre_id; PK (profile_id, genre_id)).
 * Column mapping: Profile.onboardingCompleted ⇔ `onboarded_at IS NOT NULL` (NULL until onboarding
 * is finished). Select it as `(onboarded_at IS NOT NULL) AS onboarding_completed`.
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

import { sql } from "drizzle-orm";

import { MAX_PROFILES, ONBOARDING_MIN_GENRES } from "@/lib/constants";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import type { AvatarKey, MaturityLevel, Profile, ProfileInput } from "@/types";

type ProfileRow = {
  profile_id: number;
  user_id: number;
  name: string;
  avatar: AvatarKey;
  maturity_level: MaturityLevel;
  onboarding_completed: boolean;
};

function mapProfile(row: ProfileRow): Profile {
  return {
    profileId: row.profile_id,
    userId: row.user_id,
    name: row.name,
    avatar: row.avatar,
    maturityLevel: row.maturity_level,
    onboardingCompleted: Boolean(row.onboarding_completed),
  };
}

/**
 * The account's profiles, in creation order ("Who's watching?").
 *
 * SQL:
 *   SELECT profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed
 *   FROM profile WHERE user_id = $1 ORDER BY profile_id;
 */
export async function listProfiles(userId: number): Promise<Profile[]> {
  const result = await db.execute<ProfileRow>(sql`
    SELECT profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed
    FROM profile
    WHERE user_id = ${userId}
    ORDER BY profile_id;
  `);
  return result.rows.map(mapProfile);
}

/**
 * The profile, only if it belongs to userId. A profile that exists but is someone else's is
 * reported exactly like a missing one — never reveal other accounts' profiles.
 *
 * SQL:
 *   SELECT profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed
 *   FROM profile WHERE profile_id = $1 AND user_id = $2;
 */
export async function getOwnedProfile(userId: number, profileId: number): Promise<Profile> {
  const result = await db.execute<ProfileRow>(sql`
    SELECT profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed
    FROM profile
    WHERE profile_id = ${profileId} AND user_id = ${userId};
  `);
  const row = result.rows[0];
  if (!row) throw new NotFoundError("Profile not found.");
  return mapProfile(row);
}

/**
 * Adds a profile to the account. Enforces the 5-profile limit and case-insensitive unique name per account.
 *
 * SQL:
 *   SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE;
 *   SELECT COUNT(*) FROM profile WHERE user_id = $1;
 *   INSERT INTO profile (user_id, name, avatar, maturity_level)
 *   VALUES ($1, $2, $3, $4)
 *   RETURNING profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed;
 */
export async function createProfile(userId: number, input: ProfileInput): Promise<Profile> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT user_id FROM users WHERE user_id = ${userId} FOR UPDATE;`);
    const countResult = await tx.execute<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM profile WHERE user_id = ${userId};
    `);
    const count = Number(countResult.rows[0]?.count ?? 0);
    if (count >= MAX_PROFILES) {
      throw new ConflictError("You can have up to 5 profiles.", "PROFILE_LIMIT");
    }

    try {
      const result = await tx.execute<ProfileRow>(sql`
        INSERT INTO profile (user_id, name, avatar, maturity_level)
        VALUES (${userId}, ${input.name.trim()}, ${input.avatar}, ${input.maturityLevel}::maturity_level)
        RETURNING profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed;
      `);
      const row = result.rows[0];
      return mapProfile(row);
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code === "23505") {
        throw new ConflictError("A profile with that name already exists.", "NAME_TAKEN");
      }
      throw error;
    }
  });
}

/**
 * Renames a profile or changes its avatar or maturity level.
 *
 * SQL:
 *   UPDATE profile
 *   SET name = COALESCE($3, name), avatar = COALESCE($4, avatar), maturity_level = COALESCE($5, maturity_level)
 *   WHERE profile_id = $1 AND user_id = $2
 *   RETURNING profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed;
 */
export async function updateProfile(
  userId: number,
  profileId: number,
  changes: Partial<ProfileInput>,
): Promise<Profile> {
  await getOwnedProfile(userId, profileId);

  const hasName = changes.name !== undefined && changes.name.trim().length > 0;
  const hasAvatar = changes.avatar !== undefined;
  const hasMaturity = changes.maturityLevel !== undefined;

  if (!hasName && !hasAvatar && !hasMaturity) {
    return getOwnedProfile(userId, profileId);
  }

  const nameVal = hasName ? changes.name!.trim() : null;
  const avatarVal = hasAvatar ? changes.avatar! : null;
  const maturityVal = hasMaturity ? changes.maturityLevel! : null;

  try {
    const result = await db.execute<ProfileRow>(sql`
      UPDATE profile
      SET name = COALESCE(${nameVal}, name),
          avatar = COALESCE(${avatarVal}, avatar),
          maturity_level = COALESCE(${maturityVal ? sql`${maturityVal}::maturity_level` : null}, maturity_level)
      WHERE profile_id = ${profileId} AND user_id = ${userId}
      RETURNING profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed;
    `);
    const row = result.rows[0];
    if (!row) throw new NotFoundError("Profile not found.");
    return mapProfile(row);
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") {
      throw new ConflictError("A profile with that name already exists.", "NAME_TAKEN");
    }
    throw error;
  }
}

/**
 * Removes a profile and all of its activity (watch_history, my_list, rating, profile_genre_preference)
 * through ON DELETE CASCADE. Refuses when it is the user's only profile.
 *
 * SQL:
 *   SELECT COUNT(*) FROM profile WHERE user_id = $1;
 *   DELETE FROM profile WHERE profile_id = $1 AND user_id = $2;
 */
export async function deleteProfile(userId: number, profileId: number): Promise<void> {
  await getOwnedProfile(userId, profileId);

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT user_id FROM users WHERE user_id = ${userId} FOR UPDATE;`);
    const countResult = await tx.execute<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM profile WHERE user_id = ${userId};
    `);
    const count = Number(countResult.rows[0]?.count ?? 0);
    if (count <= 1) {
      throw new ConflictError("Can't delete your only profile.", "LAST_PROFILE");
    }

    const deleteResult = await tx.execute(sql`
      DELETE FROM profile WHERE profile_id = ${profileId} AND user_id = ${userId};
    `);
    if (deleteResult.rowCount === 0) {
      throw new NotFoundError("Profile not found.");
    }
  });
}

/**
 * The profile's saved onboarding genre picks, to pre-fill the onboarding screen.
 *
 * SQL:
 *   SELECT genre_id FROM profile_genre_preference WHERE profile_id = $1 ORDER BY genre_id;
 */
export async function getGenrePreferences(profileId: number): Promise<number[]> {
  const result = await db.execute<{ genre_id: number }>(sql`
    SELECT genre_id FROM profile_genre_preference
    WHERE profile_id = ${profileId}
    ORDER BY genre_id;
  `);
  return result.rows.map((row) => row.genre_id);
}

/**
 * Saves the cold-start genre picks and finishes onboarding (sets onboarded_at). Replaces earlier picks.
 *
 * SQL:
 *   SELECT COUNT(*) FROM genre WHERE genre_id = ANY($2);
 *   DELETE FROM profile_genre_preference WHERE profile_id = $1;
 *   INSERT INTO profile_genre_preference (profile_id, genre_id) VALUES ($1, $2), ($1, $3), ...;
 *   UPDATE profile SET onboarded_at = now() WHERE profile_id = $1
 *   RETURNING profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed;
 */
export async function saveGenrePreferences(profileId: number, genreIds: number[]): Promise<Profile> {
  const distinctIds = [...new Set(genreIds)];
  if (distinctIds.length < ONBOARDING_MIN_GENRES) {
    throw new ValidationError(`Pick at least ${ONBOARDING_MIN_GENRES} genres.`);
  }

  const genreCheck = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*) AS count FROM genre WHERE genre_id = ANY(${sql.param(distinctIds)});
  `);
  const validGenreCount = Number(genreCheck.rows[0]?.count ?? 0);
  if (validGenreCount !== distinctIds.length) {
    throw new ValidationError("One or more selected genres are invalid.");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM profile_genre_preference WHERE profile_id = ${profileId};
    `);

    const valueTuples = distinctIds.map((id) => sql`(${profileId}, ${id})`);
    await tx.execute(sql`
      INSERT INTO profile_genre_preference (profile_id, genre_id)
      VALUES ${sql.join(valueTuples, sql`, `)};
    `);

    const result = await tx.execute<ProfileRow>(sql`
      UPDATE profile
      SET onboarded_at = now()
      WHERE profile_id = ${profileId}
      RETURNING profile_id, user_id, name, avatar, maturity_level, (onboarded_at IS NOT NULL) AS onboarding_completed;
    `);
    const row = result.rows[0];
    if (!row) throw new NotFoundError("Profile not found.");

    return mapProfile(row);
  });
}
