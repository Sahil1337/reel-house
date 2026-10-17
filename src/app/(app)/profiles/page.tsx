import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit01Icon } from "@hugeicons/core-free-icons";

import { Logo } from "@/components/layout/logo";
import { ProfilePicker } from "@/components/profiles/profile-picker";
import { SignOutButton } from "@/components/profiles/sign-out-button";
import { Button } from "@/components/ui/button";
import { serverApi } from "@/lib/api/server";
import { MAX_PROFILES } from "@/lib/constants";

export const metadata: Metadata = { title: "Who's watching?" };

export default async function ProfilesPage({ searchParams }: PageProps<"/profiles">) {
  const [{ manage: manageParam }, profiles] = await Promise.all([searchParams, serverApi.getProfiles()]);
  const manage = manageParam === "1";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
        <Logo />
        <SignOutButton />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 pt-8 pb-20 text-center sm:gap-14">
        <div className="flex flex-col items-center gap-3 animate-[fade-up_360ms_var(--ease-out-strong)_both] motion-reduce:animate-none">
          <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-wide sm:text-7xl">
            {manage ? "Manage profiles" : "Who's watching?"}
          </h1>
          <p className="max-w-md text-pretty text-sm text-muted-foreground sm:text-base">
            {manage
              ? `Choose a profile to rename it, change its avatar or maturity setting. Up to ${MAX_PROFILES} per account.`
              : "Each profile has its own history, list and recommendations."}
          </p>
        </div>

        <ProfilePicker profiles={profiles} manage={manage} />

        <Button
          variant={manage ? "default" : "outline"}
          size="lg"
          className="transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100"
          render={<Link href={manage ? "/profiles" : "/profiles?manage=1"} />}
        >
          {manage ? (
            "Done"
          ) : (
            <>
              <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
              Manage profiles
            </>
          )}
        </Button>
      </main>
    </div>
  );
}
