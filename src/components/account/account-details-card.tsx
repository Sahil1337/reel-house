import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { ProfileAvatar } from "@/components/profiles/profile-avatar";
import { MAX_PROFILES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Profile, User } from "@/types";

/** Who holds the account, and the profiles that watch on it. */
export function AccountDetailsCard({ user, profiles }: { user: User; profiles: Profile[] }) {
  const rows = [
    { label: "Email", value: user.email },
    { label: "Phone", value: user.phone ?? "Not added" },
    { label: "Member since", value: formatDate(user.createdAt) },
  ];

  return (
    <section aria-labelledby="account-holder" className="flex h-full flex-col gap-6 rounded-2xl border bg-card p-6">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground uppercase">Account holder</p>
        <h2 id="account-holder" className="truncate text-2xl font-semibold">
          {user.name}
        </h2>
      </div>

      {/* Side by side while the panel spans the page (below lg); stacked in the narrow column beside the ticket. */}
      <div className="grid flex-1 gap-6 md:grid-cols-2 md:gap-10 lg:flex lg:flex-col lg:gap-6">
        <dl className="flex flex-col divide-y">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
              <dt className="shrink-0 text-sm text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 truncate text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-3 lg:mt-auto">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-medium">Profiles</h3>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {profiles.length} of {MAX_PROFILES}
            </span>
          </div>
          {profiles.length > 0 ? (
            <ul className="flex flex-wrap gap-3">
              {profiles.map((profile) => (
                <li key={profile.profileId} className="flex w-14 flex-col items-center gap-1.5">
                  <ProfileAvatar avatar={profile.avatar} className="size-12 rounded-lg" />
                  <span className="w-full truncate text-center text-xs text-muted-foreground">{profile.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No profiles yet.</p>
          )}
          <Link
            href="/profiles?manage=1"
            className="group inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            Manage profiles
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              className="size-4 transition-transform duration-150 ease-out-strong group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
