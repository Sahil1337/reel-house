import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { ProfileAvatar } from "@/components/profiles/profile-avatar";
import { Button } from "@/components/ui/button";
import { serverApi } from "@/lib/api/server";
import { requireProfile } from "@/server/session/current-session";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function OnboardingPage() {
  const profile = await requireProfile();
  const [genres, selections] = await Promise.all([serverApi.getGenres(), serverApi.getOnboarding(profile.profileId)]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
        <Logo href="/profiles" />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <ProfileAvatar avatar={profile.avatar} className="size-6 rounded-sm" />
            <span className="hidden sm:inline">Setting up {profile.name}</span>
          </span>
          {profile.onboardingCompleted ? (
            <Button variant="ghost" render={<Link href="/browse" />}>
              Skip
            </Button>
          ) : null}
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <OnboardingFlow profile={profile} genres={genres} initialGenreIds={selections.genreIds} />
      </main>
    </div>
  );
}
