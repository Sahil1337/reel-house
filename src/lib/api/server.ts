/**
 * Typed GETs against our own API routes (src/app/api) for server components.
 * Builds an absolute URL from the incoming request and forwards its cookies, so the
 * routes see the same session and profileId cookies as the browser.
 */
import "server-only";

import { cookies, headers } from "next/headers";

import type {
  AdminDashboard,
  ContentDetail,
  ContentSummary,
  Genre,
  HistoryItem,
  HomeFeed,
  OnboardingInput,
  PaymentWithPlan,
  Profile,
  SubscriptionPlan,
  SubscriptionWithPlan,
  TitleActivity,
  User,
} from "@/types";

import { ApiError, contentQueryString, type ContentQuery } from "./client";

async function get<T>(path: string): Promise<T> {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";

  const response = await fetch(`${protocol}://${host}/api${path}`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? `GET /api${path} failed (${response.status})`, response.status);
  return data as T;
}

/** Like `get`, but 401 and 404 resolve to null (for "is there one?" lookups). */
async function find<T>(path: string): Promise<T | null> {
  try {
    return await get<T>(path);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return null;
    throw error;
  }
}

const profilePath = (profileId: number, rest = "") => `/profiles/${profileId}${rest}`;

export const serverApi = {
  // Auth
  findMe: async () => (await find<{ user: User }>("/auth/me"))?.user ?? null,

  // Account & billing
  getAccount: () => get<{ user: User; subscription: SubscriptionWithPlan | null }>("/account"),
  getSubscriptions: async () =>
    (await get<{ subscriptions: SubscriptionWithPlan[] }>("/account/subscriptions")).subscriptions,
  getPayments: async () => (await get<{ payments: PaymentWithPlan[] }>("/account/payments")).payments,
  getPlans: async () => (await get<{ plans: SubscriptionPlan[] }>("/plans")).plans,

  // Catalogue
  getGenres: async () => (await get<{ genres: Genre[] }>("/genres")).genres,
  searchContent: async (query: ContentQuery) =>
    (await get<{ items: ContentSummary[] }>(`/content?${contentQueryString(query)}`)).items,
  findContent: async (contentId: number) =>
    (await find<{ content: ContentDetail }>(`/content/${contentId}`))?.content ?? null,
  getSimilar: async (contentId: number) =>
    (await get<{ items: ContentSummary[] }>(`/content/${contentId}/similar`)).items,

  // Profiles & activity
  getProfiles: async () => (await get<{ profiles: Profile[] }>("/profiles")).profiles,
  findProfile: async (profileId: number) => (await find<{ profile: Profile }>(profilePath(profileId)))?.profile ?? null,
  getHome: (profileId: number) => get<HomeFeed>(profilePath(profileId, "/home")),
  getHistory: async (profileId: number) =>
    (await get<{ items: HistoryItem[] }>(profilePath(profileId, "/history"))).items,
  getMyList: async (profileId: number) =>
    (await get<{ items: (ContentSummary & { addedAt: string })[] }>(profilePath(profileId, "/my-list"))).items,
  getTitleActivity: (profileId: number, contentId: number) =>
    get<TitleActivity>(profilePath(profileId, `/titles/${contentId}`)),
  getOnboarding: (profileId: number) => get<OnboardingInput>(profilePath(profileId, "/onboarding")),

  // Admin
  getAdminDashboard: () => get<AdminDashboard>("/admin/dashboard"),
};
