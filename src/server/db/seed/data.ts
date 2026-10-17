/** Typed loaders for the TMDB snapshot and the mock JSON files (only the fields the seed needs). */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "data");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as T;
}

export interface TmdbGenre {
  tmdbId: number;
  name: string;
}
export interface TmdbPerson {
  tmdbId: number;
  name: string;
  dateOfBirth: string | null;
  photoUrl: string | null;
}
export interface TmdbEpisode {
  episodeNumber: number;
  title: string;
  description: string | null;
  releaseDate: string | null;
  durationMinutes: number | null;
  stillUrl: string | null;
}
export interface TmdbSeason {
  seasonNumber: number;
  name: string;
  releaseDate: string | null;
  episodes: TmdbEpisode[];
}
export interface TmdbTitle {
  tmdbId: number;
  contentType: "MOVIE" | "SERIES";
  title: string;
  description: string | null;
  releaseDate: string | null;
  durationMinutes: number | null;
  ageRating: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genreIds: number[];
  cast: { personTmdbId: number; characterName: string | null; order: number }[];
  directorIds: number[];
  seasons?: TmdbSeason[];
}

export interface MockUser {
  userId: number;
  name: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
}
export interface MockProfile {
  profileId: number;
  userId: number;
  name: string;
  avatar: string;
  maturityLevel: "KIDS" | "TEEN" | "ADULT";
  onboardingCompleted?: boolean;
  genrePreferences?: (string | number)[];
}
export interface MockPlan {
  planId: number;
  name: string;
  priceMonthly: number;
  videoQuality: string;
  maxDevices: number;
}
export interface MockSubscription {
  subscriptionId: number;
  userId: number;
  planId: number;
  startDate: string | null;
  endDate: string | null;
  status: "PENDING" | "ACTIVE" | "CANCELLED" | "EXPIRED";
  createdAt: string;
}
export interface MockPayment {
  paymentId: number;
  subscriptionId: number;
  paymentDate: string;
  amount: number;
  paymentMode: "CARD" | "UPI" | "NET_BANKING" | "WALLET";
  transactionRef: string;
  gatewayOrderId: string;
  status: "SUCCESS" | "FAILED" | "REFUNDED";
}
export interface TitleRef {
  contentType: "MOVIE" | "SERIES";
  tmdbId: number;
}
export interface MockWatch extends TitleRef {
  profileId: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
  watchedAt: string;
  progressPercent: number;
}
export interface MockListEntry extends TitleRef {
  profileId: number;
  addedAt: string;
}
export interface MockRating extends TitleRef {
  profileId: number;
  value: number;
  ratedAt: string;
}

export function loadAll() {
  return {
    genres: readJson<TmdbGenre[]>("tmdb/genres.json"),
    movies: readJson<TmdbTitle[]>("tmdb/movies.json"),
    series: readJson<TmdbTitle[]>("tmdb/series.json"),
    people: readJson<TmdbPerson[]>("tmdb/people.json"),
    users: readJson<MockUser[]>("mock/users.json"),
    profiles: readJson<MockProfile[]>("mock/profiles.json"),
    plans: readJson<MockPlan[]>("mock/plans.json"),
    subscriptions: readJson<MockSubscription[]>("mock/subscriptions.json"),
    payments: readJson<MockPayment[]>("mock/payments.json"),
    watchHistory: readJson<MockWatch[]>("mock/watch-history.json"),
    myList: readJson<MockListEntry[]>("mock/my-list.json"),
    ratings: readJson<MockRating[]>("mock/ratings.json"),
  };
}
export type SeedData = ReturnType<typeof loadAll>;
