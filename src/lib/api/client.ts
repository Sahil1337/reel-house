/**
 * Typed fetchers for the REST API in src/app/api, used by client components.
 * Server components use src/lib/api/server.ts, which calls the same routes.
 */
import type {
  AdminContentFilters,
  AdminContentRow,
  AdminPage,
  AdminPlan,
  AdminSubscriptionAction,
  AdminSubscriptionFilters,
  AdminSubscriptionRow,
  ChangePlanInput,
  CheckoutOrder,
  ImportTitleInput,
  ImportTitleResult,
  ContentDeletionImpact,
  ContentDetail,
  ContentSummary,
  ContentType,
  CreatePlanInput,
  Genre,
  OnboardingInput,
  Profile,
  ProfileInput,
  ProgressInput,
  Rating,
  SubscriptionWithPlan,
  TmdbMediaType,
  TmdbSearchResult,
  TmdbTitlePreview,
  UpdateContentInput,
  UpdatePlanInput,
  User,
  VerifyPaymentInput,
  WatchHistory,
} from "@/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable reason some routes add, e.g. "TMDB_KEY_MISSING". */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ContentQuery {
  q?: string;
  type?: ContentType;
  genre?: number;
  limit?: number;
}

/** `?q=…&type=…` for GET /api/content (shared with src/lib/api/server.ts). */
export function contentQueryString({ q, type, genre, limit }: ContentQuery): string {
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (type) query.set("type", type);
  if (genre) query.set("genre", String(genre));
  if (limit) query.set("limit", String(limit));
  return query.toString();
}

async function request<T>(path: string, init?: Omit<RequestInit, "body"> & { body?: unknown }): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? "Something went wrong. Try again.", response.status, data.code);
  return data as T;
}

/** `?q=…&page=…` for the admin list routes (shared with src/lib/api/server.ts). Skips empty values. */
export function adminQueryString(filters: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

const profilePath = (profileId: number, rest = "") => `/profiles/${profileId}${rest}`;

export const api = {
  // Auth
  signIn: (body: { email: string; password: string }) =>
    request<{ user: User }>("/auth/sign-in", { method: "POST", body }),
  signUp: (body: { name: string; email: string; phone: string | null; password: string }) =>
    request<{ user: User }>("/auth/sign-up", { method: "POST", body }),
  signOut: () => request<void>("/auth/sign-out", { method: "POST" }),

  // Profiles
  createProfile: (body: ProfileInput) => request<{ profile: Profile }>("/profiles", { method: "POST", body }),
  updateProfile: (profileId: number, body: Partial<ProfileInput>) =>
    request<{ profile: Profile }>(profilePath(profileId), { method: "PATCH", body }),
  deleteProfile: (profileId: number) => request<void>(profilePath(profileId), { method: "DELETE" }),

  // Onboarding
  completeOnboarding: (profileId: number, body: OnboardingInput) =>
    request<{ profile: Profile }>(profilePath(profileId, "/onboarding"), { method: "PUT", body }),

  // Activity
  addToMyList: (profileId: number, contentId: number) =>
    request<{ inMyList: boolean }>(profilePath(profileId, "/my-list"), { method: "POST", body: { contentId } }),
  removeFromMyList: (profileId: number, contentId: number) =>
    request<{ inMyList: boolean }>(profilePath(profileId, `/my-list/${contentId}`), { method: "DELETE" }),
  rate: (profileId: number, contentId: number, value: number) =>
    request<{ rating: Rating }>(profilePath(profileId, `/ratings/${contentId}`), { method: "PUT", body: { value } }),
  removeRating: (profileId: number, contentId: number) =>
    request<void>(profilePath(profileId, `/ratings/${contentId}`), { method: "DELETE" }),
  recordProgress: (profileId: number, body: ProgressInput) =>
    request<{ entry: WatchHistory }>(profilePath(profileId, "/progress"), { method: "POST", body }),
  removeHistoryEntry: (profileId: number, historyId: number) =>
    request<void>(profilePath(profileId, `/history/${historyId}`), { method: "DELETE" }),

  // Catalogue
  searchContent: (query: ContentQuery, init?: { signal?: AbortSignal }) =>
    request<{ items: ContentSummary[] }>(`/content?${contentQueryString(query)}`, init),

  // Account & billing
  getAccount: () =>
    request<{ user: User; subscription: SubscriptionWithPlan | null }>("/account", { cache: "no-store" }),
  /** Creates the Razorpay order; open Razorpay Checkout with the result. */
  startCheckout: (body: ChangePlanInput) => request<CheckoutOrder>("/account/subscriptions", { method: "POST", body }),
  /** Cancels the user's ACTIVE subscription. */
  cancelSubscription: (subscriptionId: number) =>
    request<{ subscription: SubscriptionWithPlan }>(`/account/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
    }),
  /** Checkout's success-handler response, checked on the server. */
  verifyPayment: (body: VerifyPaymentInput) =>
    request<{ verified: true }>("/payments/verify", { method: "POST", body }),

  // Admin
  searchTmdb: (q: string, type: TmdbMediaType, init?: { signal?: AbortSignal }) =>
    request<{ results: TmdbSearchResult[]; totalResults: number }>(
      `/admin/tmdb/search?${new URLSearchParams({ q, type })}`,
      init,
    ),
  getTmdbTitle: (type: TmdbMediaType, tmdbId: number, init?: { signal?: AbortSignal }) =>
    request<TmdbTitlePreview>(`/admin/tmdb/${type}/${tmdbId}`, init),
  importTitle: (body: ImportTitleInput) =>
    request<ImportTitleResult>("/admin/content/import", { method: "POST", body }),

  // Admin: content
  listGenres: (init?: { signal?: AbortSignal }) => request<{ genres: Genre[] }>("/genres", init),
  getContent: (contentId: number, init?: { signal?: AbortSignal }) =>
    request<{ content: ContentDetail }>(`/content/${contentId}`, init),
  listAdminContent: (filters: AdminContentFilters, init?: { signal?: AbortSignal }) =>
    request<AdminPage<AdminContentRow>>(`/admin/content?${adminQueryString(filters)}`, init),
  getContentImpact: (contentId: number, init?: { signal?: AbortSignal }) =>
    request<ContentDeletionImpact>(`/admin/content/${contentId}/impact`, init),
  updateContent: (contentId: number, body: UpdateContentInput) =>
    request<{ content: AdminContentRow }>(`/admin/content/${contentId}`, { method: "PATCH", body }),
  deleteContent: (contentId: number) => request<void>(`/admin/content/${contentId}`, { method: "DELETE" }),

  // Admin: plans
  listAdminPlans: (init?: { signal?: AbortSignal }) => request<{ plans: AdminPlan[] }>("/admin/plans", init),
  createPlan: (body: CreatePlanInput) => request<{ plan: AdminPlan }>("/admin/plans", { method: "POST", body }),
  updatePlan: (planId: number, body: UpdatePlanInput) =>
    request<{ plan: AdminPlan }>(`/admin/plans/${planId}`, { method: "PATCH", body }),
  deletePlan: (planId: number) => request<void>(`/admin/plans/${planId}`, { method: "DELETE" }),

  // Admin: subscriptions
  listAdminSubscriptions: (filters: AdminSubscriptionFilters, init?: { signal?: AbortSignal }) =>
    request<AdminPage<AdminSubscriptionRow>>(`/admin/subscriptions?${adminQueryString(filters)}`, init),
  updateSubscription: (subscriptionId: number, body: AdminSubscriptionAction) =>
    request<{ subscription: AdminSubscriptionRow }>(`/admin/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body,
    }),
};
