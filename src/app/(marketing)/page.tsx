import { SiteFooter } from "@/components/layout/site-footer";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LandingHeader } from "@/components/marketing/landing-header";
import { LandingHero } from "@/components/marketing/landing-hero";
import { PlansSection } from "@/components/marketing/plans-section";
import { serverApi } from "@/lib/api/server";
import { getCurrentUser } from "@/server/session/current-session";

export default async function LandingPage() {
  const [user, posters, plans] = await Promise.all([
    getCurrentUser(),
    serverApi.searchContent({ limit: 24 }),
    serverApi.getPlans(),
  ]);
  const startingPrice = plans.length > 0 ? Math.min(...plans.map((plan) => plan.priceMonthly)) : null;
  const signedIn = user !== null;

  return (
    <div className="flex min-h-dvh flex-col">
      <LandingHeader signedIn={signedIn} />
      <main className="flex-1">
        <LandingHero posters={posters} signedIn={signedIn} startingPrice={startingPrice} />
        <HowItWorks />
        <PlansSection plans={plans} signedIn={signedIn} />
      </main>
      <SiteFooter />
    </div>
  );
}
