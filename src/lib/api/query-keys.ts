/**
 * Every TanStack Query key in one place. Keys go from general to specific, so invalidating a
 * parent (`queryKeys.profile.all(id)`) also covers its children.
 */
import type { ContentQuery } from "@/lib/api/client";
import type { TmdbMediaType } from "@/types";

/** Drops empty values so `{ q: "" }` and `{}` share a cache entry. */
const normalize = ({ q, type, genre, limit }: ContentQuery) => ({
  q: q?.trim() || undefined,
  type: type || undefined,
  genre: genre || undefined,
  limit: limit || undefined,
});

export const queryKeys = {
  content: {
    all: ["content"] as const,
    search: (params: ContentQuery) => ["content", "search", normalize(params)] as const,
  },

  profile: {
    /** Everything cached for one profile. */
    all: (profileId: number) => ["profile", profileId] as const,
    /** The signed-in user's profiles (seeded from the server-rendered list). */
    list: () => ["profiles"] as const,
    home: (profileId: number) => ["profile", profileId, "home"] as const,
    myList: (profileId: number) => ["profile", profileId, "my-list"] as const,
    /** Whether one title is in the profile's list (seeded from the server-rendered page). */
    myListStatus: (profileId: number, contentId: number) =>
      ["profile", profileId, "my-list", "status", contentId] as const,
    /** The profile's saved 1-5 rating for one title (seeded from the server-rendered page). */
    rating: (profileId: number, contentId: number) => ["profile", profileId, "rating", contentId] as const,
    history: (profileId: number) => ["profile", profileId, "history"] as const,
    /** History entry ids removed on this page but not yet gone from the server-rendered list. */
    removedHistory: (profileId: number) => ["profile", profileId, "history", "removed"] as const,
  },

  account: {
    all: ["account"] as const,
    current: () => ["account", "current"] as const,
    /** Polling for the subscription a verified payment is about to activate. */
    activation: (subscriptionId: number) => ["account", "activation", subscriptionId] as const,
  },

  admin: {
    all: ["admin"] as const,
    tmdbSearch: (q: string, type: TmdbMediaType) => ["admin", "tmdb", "search", type, q] as const,
    tmdbTitle: (type: TmdbMediaType, tmdbId: number) => ["admin", "tmdb", "title", type, tmdbId] as const,
  },
} as const;
