/**
 * TEMPORARY mock "database" for the API route stubs in src/app/api.
 *
 * Loads data/tmdb (catalogue) and data/mock (accounts + activity) once, assigns app ids
 * and resolves the mock rows' title references (snapshot entries, matched in memory) into the
 * row shapes from src/types. Read-only:
 * mutations in the stubs persist nothing. Only route handlers may import this module —
 * when the real backend lands, rewrite the route bodies and delete src/server/mocks/.
 */
import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import type {
  ContentDetail,
  ContentSummary,
  HistoryItem,
  MyListEntry,
  Payment,
  Profile,
  ProfileGenrePreference,
  Rating,
  Subscription,
  SubscriptionPlan,
  SubscriptionWithPlan,
  User,
  WatchHistory,
} from "@/types";

import { buildCatalog, type Catalog } from "./catalog";
import type {
  MockMyListEntry,
  MockUser,
  MockProfile,
  MockRating,
  MockWatchHistory,
  SnapshotContent,
  SnapshotGenre,
  SnapshotPerson,
  TitleRef,
} from "./types";

export interface MockDb extends Catalog {
  /** Without password hashes — see findUserCredentials. */
  users: User[];
  passwordHashByUserId: Map<number, string>;
  profiles: Profile[];
  genrePreferences: ProfileGenrePreference[];
  plans: SubscriptionPlan[];
  subscriptions: Subscription[];
  payments: Payment[];
  /** Newest first, as stored in data/mock/watch-history.json. */
  watchHistory: WatchHistory[];
  myList: MyListEntry[];
  ratings: Rating[];
}

/** Paths are spelled out per folder so the production build only traces data/. */
function readTmdb<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", "tmdb", `${name}.json`), "utf8")) as T;
}

function readMock<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", "mock", `${name}.json`), "utf8")) as T;
}

function loadMockDb(): MockDb {
  const catalog = buildCatalog({
    genres: readTmdb<SnapshotGenre[]>("genres"),
    people: readTmdb<SnapshotPerson[]>("people"),
    movies: readTmdb<SnapshotContent[]>("movies"),
    series: readTmdb<SnapshotContent[]>("series"),
  });

  const contentIdOf = (ref: TitleRef, file: string) => {
    const content = catalog.findByTmdb(ref.contentType, ref.tmdbId);
    if (!content) throw new Error(`data/mock/${file}: no ${ref.contentType} with tmdbId ${ref.tmdbId} in data/tmdb.`);
    return content;
  };

  const mockProfiles = readMock<MockProfile[]>("profiles");
  const profiles: Profile[] = mockProfiles.map((profile) => ({
    profileId: profile.profileId,
    userId: profile.userId,
    name: profile.name,
    avatar: profile.avatar,
    maturityLevel: profile.maturityLevel,
    onboardingCompleted: profile.onboardingCompleted,
  }));
  const genrePreferences = mockProfiles.flatMap((profile) =>
    profile.genrePreferences.map((name) => {
      const genre = catalog.genreByName.get(name);
      if (!genre) throw new Error(`data/mock/profiles.json: unknown genre "${name}".`);
      return { profileId: profile.profileId, genreId: genre.genreId };
    }),
  );

  const watchHistory: WatchHistory[] = readMock<MockWatchHistory[]>("watch-history").map(
    ({ contentType, tmdbId, seasonNumber, episodeNumber, ...row }) => {
      const content = contentIdOf({ contentType, tmdbId }, "watch-history.json");
      let episodeId: number | null = null;
      if (seasonNumber !== null && episodeNumber !== null) {
        const season = content.seasons.find((entry) => entry.seasonNumber === seasonNumber);
        const episode = season?.episodes.find((entry) => entry.episodeNumber === episodeNumber);
        if (!episode) {
          throw new Error(`data/mock/watch-history.json: ${content.title} has no S${seasonNumber}E${episodeNumber}.`);
        }
        episodeId = episode.episodeId;
      }
      return { ...row, contentId: content.contentId, episodeId };
    },
  );

  const myList: MyListEntry[] = readMock<MockMyListEntry[]>("my-list").map(({ contentType, tmdbId, ...row }) => ({
    ...row,
    contentId: contentIdOf({ contentType, tmdbId }, "my-list.json").contentId,
  }));

  const ratings: Rating[] = readMock<MockRating[]>("ratings").map(({ contentType, tmdbId, ...row }) => ({
    ...row,
    contentId: contentIdOf({ contentType, tmdbId }, "ratings.json").contentId,
  }));

  const mockUsers = readMock<MockUser[]>("users");

  return {
    ...catalog,
    users: mockUsers.map((user) => ({
      userId: user.userId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    })),
    passwordHashByUserId: new Map(mockUsers.map((user) => [user.userId, user.passwordHash])),
    profiles,
    genrePreferences,
    plans: readMock<SubscriptionPlan[]>("plans"),
    subscriptions: readMock<Subscription[]>("subscriptions"),
    payments: readMock<Payment[]>("payments"),
    watchHistory,
    myList,
    ratings,
  };
}

let db: MockDb | undefined;

export function getMockDb(): MockDb {
  db ??= loadMockDb();
  return db;
}

export function findUser(userId: number): User | undefined {
  return getMockDb().users.find((user) => user.userId === userId);
}

/** The user with this email (case-insensitive) and their stored password hash. */
export function findUserCredentials(email: string): { user: User; passwordHash: string } | undefined {
  const { users, passwordHashByUserId } = getMockDb();
  const user = users.find((entry) => entry.email.toLowerCase() === email.trim().toLowerCase());
  const passwordHash = user && passwordHashByUserId.get(user.userId);
  return user && passwordHash ? { user, passwordHash } : undefined;
}

export function findProfile(profileId: string | number): Profile | undefined {
  return getMockDb().profiles.find((profile) => profile.profileId === Number(profileId));
}

export function findContent(contentId: string | number): ContentDetail | undefined {
  return getMockDb().contentById.get(Number(contentId));
}

/** Drops cast, directors and seasons — the shape cards and rows use. */
export function toSummary(content: ContentDetail): ContentSummary {
  const { contentId, title, description, releaseDate, contentType, durationMinutes, ageRating, maturityLevel } =
    content;
  const { posterUrl, backdropUrl, genres } = content;
  return {
    contentId,
    title,
    description,
    releaseDate,
    contentType,
    durationMinutes,
    ageRating,
    maturityLevel,
    posterUrl,
    backdropUrl,
    genres,
  };
}

/** watch_history row joined with its title (and episode + season number for series). */
export function toHistoryItem(row: WatchHistory): HistoryItem {
  const { contentById, episodeById } = getMockDb();
  const context = row.episodeId ? episodeById.get(row.episodeId) : undefined;
  return {
    ...row,
    content: toSummary(contentById.get(row.contentId)!),
    episode: context ? { ...context.episode, seasonNumber: context.season.seasonNumber } : null,
  };
}

export function withPlan(subscription: Subscription): SubscriptionWithPlan {
  return { ...subscription, plan: getMockDb().plans.find((plan) => plan.planId === subscription.planId)! };
}
