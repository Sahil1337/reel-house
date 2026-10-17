/** Accounts and billing steps: users, profiles, preferences, plans, subscriptions, payments. */
import { payment, profile, profileGenrePreference, subscription, subscriptionPlan, users } from "../schema";
import type { SeedData } from "./data";
import { fail, logCount, lookup, toDate, type Tx } from "./util";

export async function seedUsers(tx: Tx, data: SeedData) {
  const src = [...data.users].sort((a, b) => a.userId - b.userId);
  const res = await tx
    .insert(users)
    .values(
      src.map((u) => ({
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
        phone: u.phone,
        role: u.role,
        createdAt: toDate(u.createdAt),
      })),
    )
    .returning({ id: users.userId });
  const userById = new Map<number, number>();
  src.forEach((u, i) => userById.set(u.userId, res[i].id));
  logCount("users", res.length);
  return userById;
}

export async function seedProfiles(
  tx: Tx,
  data: SeedData,
  userById: Map<number, number>,
  genreByTmdb: Map<number, number>,
  genreByName: Map<string, number>,
) {
  const src = [...data.profiles].sort((a, b) => a.profileId - b.profileId);
  const userCreated = new Map(data.users.map((u) => [u.userId, u.createdAt]));
  const res = await tx
    .insert(profile)
    .values(
      src.map((p) => {
        const onboarded = p.onboardingCompleted === true || (p.genrePreferences?.length ?? 0) > 0;
        return {
          userId: lookup(userById, p.userId, `profile.userId (profile ${p.profileId})`),
          name: p.name,
          avatar: p.avatar,
          maturityLevel: p.maturityLevel,
          onboardedAt: onboarded ? toDate(userCreated.get(p.userId) ?? new Date().toISOString()) : null,
        };
      }),
    )
    .returning({ id: profile.profileId });
  const profileById = new Map<number, number>();
  src.forEach((p, i) => profileById.set(p.profileId, res[i].id));
  logCount("profile", res.length);

  const prefs = new Map<string, { profileId: number; genreId: number }>();
  for (const p of src) {
    for (const g of p.genrePreferences ?? []) {
      const genreId = typeof g === "number" ? (genreByTmdb.get(g) ?? undefined) : genreByName.get(g.toLowerCase());
      if (genreId === undefined) fail(`unresolvable genre preference "${g}" (profile ${p.profileId})`);
      const profileId = profileById.get(p.profileId)!;
      prefs.set(`${profileId}:${genreId}`, { profileId, genreId });
    }
  }
  if (prefs.size) await tx.insert(profileGenrePreference).values([...prefs.values()]);
  logCount("profile_genre_preference", prefs.size);
  return profileById;
}

/** The DB column is varchar(10) ('720p' | '1080p' | '4K'); mock labels like "Full HD 1080p" are reduced to that. */
function shortQuality(label: string): string {
  const m = label.match(/720p|1080p|4K/i);
  return m ? m[0] : label.slice(0, 10);
}

export async function seedBilling(tx: Tx, data: SeedData, userById: Map<number, number>) {
  const plans = [...data.plans].sort((a, b) => a.planId - b.planId);
  const planRes = await tx
    .insert(subscriptionPlan)
    .values(
      plans.map((p) => ({
        name: p.name,
        priceMonthly: p.priceMonthly.toFixed(2),
        videoQuality: shortQuality(p.videoQuality),
        maxDevices: p.maxDevices,
      })),
    )
    .returning({ id: subscriptionPlan.planId });
  const planById = new Map<number, number>();
  plans.forEach((p, i) => planById.set(p.planId, planRes[i].id));
  logCount("subscription_plan", planRes.length);

  const subs = [...data.subscriptions].sort((a, b) => a.subscriptionId - b.subscriptionId);
  const subRes = await tx
    .insert(subscription)
    .values(
      subs.map((s) => ({
        userId: lookup(userById, s.userId, `subscription.userId (sub ${s.subscriptionId})`),
        planId: lookup(planById, s.planId, `subscription.planId (sub ${s.subscriptionId})`),
        startDate: s.startDate ? toDate(s.startDate) : null,
        endDate: s.endDate ? toDate(s.endDate) : null,
        status: s.status,
        createdAt: toDate(s.createdAt),
      })),
    )
    .returning({ id: subscription.subscriptionId });
  const subById = new Map<number, number>();
  subs.forEach((s, i) => subById.set(s.subscriptionId, subRes[i].id));
  logCount("subscription", subRes.length);

  const pays = [...data.payments].sort((a, b) => a.paymentId - b.paymentId);
  if (pays.length) {
    await tx.insert(payment).values(
      pays.map((p) => ({
        subscriptionId: lookup(subById, p.subscriptionId, `payment.subscriptionId (payment ${p.paymentId})`),
        paymentDate: toDate(p.paymentDate),
        amount: p.amount.toFixed(2),
        paymentMode: p.paymentMode,
        transactionRef: p.transactionRef,
        gatewayOrderId: p.gatewayOrderId,
        status: p.status,
      })),
    );
  }
  logCount("payment", pays.length);
}
