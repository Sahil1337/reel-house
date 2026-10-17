"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardSquare01Icon, Logout01Icon, PencilEdit01Icon, UserCircleIcon } from "@hugeicons/core-free-icons";

import { ProfileAvatar } from "@/components/profiles/profile-avatar";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useSignOut } from "@/hooks/queries/auth";
import { setProfileCookie } from "@/lib/cookies/profile-cookie";
import type { Profile } from "@/types";

export function ProfileMenu({
  profile,
  profiles,
  isAdmin,
}: {
  profile: Profile;
  profiles: Profile[];
  isAdmin: boolean;
}) {
  const router = useRouter();

  const switchTo = (target: Profile) => {
    setProfileCookie(target.profileId);
    router.push(target.onboardingCompleted ? "/browse" : "/onboarding");
    router.refresh();
  };

  const { mutate: signOut } = useSignOut();

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Profile menu for ${profile.name}`}
        className="flex cursor-pointer items-center gap-2 rounded-md p-0.5 outline-none transition-transform duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ProfileAvatar avatar={profile.avatar} />
      </MenuTrigger>
      <MenuPopup align="end" className="w-56">
        <MenuGroup>
          <MenuGroupLabel>Watching as {profile.name}</MenuGroupLabel>
          {profiles
            .filter((other) => other.profileId !== profile.profileId)
            .map((other) => (
              <MenuItem key={other.profileId} onClick={() => switchTo(other)}>
                <ProfileAvatar avatar={other.avatar} className="size-6 rounded-sm" />
                {other.name}
              </MenuItem>
            ))}
          <MenuLinkItem render={<Link href="/profiles?manage=1" />}>
            <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
            Manage profiles
          </MenuLinkItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/account" />}>
          <HugeiconsIcon icon={UserCircleIcon} strokeWidth={2} />
          Account
        </MenuLinkItem>
        {isAdmin ? (
          <MenuLinkItem render={<Link href="/admin" />}>
            <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />
            Admin
          </MenuLinkItem>
        ) : null}
        <MenuItem onClick={() => signOut()}>
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
          Sign out
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
