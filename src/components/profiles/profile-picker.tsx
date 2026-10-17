"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Spinner } from "@/components/ui/spinner";
import { useProfileList } from "@/hooks/queries/profiles";
import { MAX_PROFILES } from "@/lib/constants";
import { setProfileCookie } from "@/lib/cookies/profile-cookie";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

import { ProfileAvatar } from "./profile-avatar";
import { ProfileFormDialog } from "./profile-form-dialog";

const TILE = cn(
  "group/tile flex w-28 flex-col items-center gap-3 rounded-xl p-1 outline-none sm:w-36",
  "animate-[pop-in_320ms_var(--ease-out-strong)_both] motion-reduce:animate-none",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
  "disabled:cursor-default",
);
const TILE_ART = cn(
  "relative aspect-square w-full overflow-hidden rounded-xl ring-1 ring-foreground/8",
  "transition-[transform,box-shadow] duration-200 ease-out-strong",
  "group-hover/tile:scale-[1.04] group-hover/tile:ring-2 group-hover/tile:ring-foreground/60",
  "group-active/tile:scale-[0.97] motion-reduce:transform-none",
);
const STAGGER_MS = 50;

/**
 * "Who's watching?" grid. In manage mode the same tiles open the edit dialog.
 * Choosing a profile stores it in the profileId cookie; edits update the grid through the cached profile list.
 */
export function ProfilePicker({ profiles: initialProfiles, manage }: { profiles: Profile[]; manage: boolean }) {
  const router = useRouter();
  const { data: profiles } = useProfileList(initialProfiles);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const canAdd = profiles.length < MAX_PROFILES;

  function select(profile: Profile) {
    if (selectingId !== null) return;
    // TODO(backend): drop this guard once POST /api/profiles persists new profiles.
    if (!initialProfiles.some((saved) => saved.profileId === profile.profileId)) {
      toast.info(`${profile.name} isn't saved yet`, {
        description: "Demo mode: new profiles can't be opened until the backend exists.",
      });
      return;
    }
    setSelectingId(profile.profileId);
    setProfileCookie(profile.profileId);
    router.push(profile.onboardingCompleted ? "/browse" : "/onboarding");
  }

  function openDialog(profile: Profile | null) {
    setEditing(profile);
    setDialogOpen(true);
  }

  return (
    <>
      <ul className="flex max-w-3xl flex-wrap justify-center gap-4 sm:gap-8">
        {profiles.map((profile, index) => {
          const selecting = selectingId === profile.profileId;
          return (
            <li key={profile.profileId}>
              <button
                type="button"
                onClick={() => (manage ? openDialog(profile) : select(profile))}
                disabled={selectingId !== null}
                aria-label={manage ? `Edit ${profile.name}` : profile.name}
                aria-busy={selecting || undefined}
                className={cn(TILE, selectingId !== null && !selecting && "opacity-40 transition-opacity duration-200")}
                style={{ animationDelay: `${index * STAGGER_MS}ms` }}
              >
                <span className={TILE_ART}>
                  <ProfileAvatar avatar={profile.avatar} className="size-full rounded-none" iconClassName="size-2/5" />
                  {manage ? (
                    <span className="absolute inset-0 grid place-items-center bg-scrim/60">
                      <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} className="size-7 text-foreground" />
                    </span>
                  ) : null}
                  {selecting ? (
                    <span className="absolute inset-0 grid place-items-center bg-scrim/50 animate-[fade-in_150ms_ease-out_both]">
                      <Spinner className="size-6 text-foreground" />
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "max-w-full truncate text-sm text-muted-foreground transition-colors duration-150 sm:text-base",
                    "group-hover/tile:text-foreground group-focus-visible/tile:text-foreground",
                    selecting && "text-foreground",
                  )}
                >
                  {profile.name}
                </span>
              </button>
            </li>
          );
        })}

        {canAdd ? (
          <li>
            <button
              type="button"
              onClick={() => openDialog(null)}
              disabled={selectingId !== null}
              className={cn(TILE, selectingId !== null && "opacity-40")}
              style={{ animationDelay: `${profiles.length * STAGGER_MS}ms` }}
            >
              <span
                className={cn(
                  TILE_ART,
                  "grid place-items-center border-2 border-dashed border-border bg-transparent ring-0",
                )}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} className="size-1/3 text-muted-foreground" />
              </span>
              <span className="text-sm text-muted-foreground transition-colors duration-150 group-hover/tile:text-foreground sm:text-base">
                Add profile
              </span>
            </button>
          </li>
        ) : null}
      </ul>

      <ProfileFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profile={editing}
        canDelete={profiles.length > 1}
      />
    </>
  );
}
