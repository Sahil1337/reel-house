"use client";

import { RadioGroup, RadioPrimitive } from "@/components/ui/radio-group";
import { AVATAR_KEYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AvatarKey } from "@/types";

import { AVATARS, ProfileAvatar } from "./profile-avatar";

/** The eight avatars as a radio grid (arrow keys move between them). */
export function AvatarPicker({
  value,
  onValueChange,
}: {
  value: AvatarKey;
  onValueChange: (value: AvatarKey) => void;
}) {
  return (
    <RadioGroup
      aria-label="Avatar"
      value={value}
      onValueChange={(next) => onValueChange(next as AvatarKey)}
      className="grid grid-cols-4 gap-2 sm:gap-3"
    >
      {AVATAR_KEYS.map((key) => (
        <RadioPrimitive.Root
          key={key}
          value={key}
          aria-label={AVATARS[key].label}
          className={cn(
            "cursor-pointer rounded-lg p-0.5 outline-none ring-2 ring-transparent",
            "transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100",
            "data-checked:ring-primary focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
          )}
        >
          <ProfileAvatar avatar={key} className="aspect-square size-full rounded-md" />
        </RadioPrimitive.Root>
      ))}
    </RadioGroup>
  );
}
