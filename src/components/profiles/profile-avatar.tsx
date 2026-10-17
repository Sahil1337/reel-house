import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  BulbIcon,
  Camera01Icon,
  ClapperboardIcon,
  FilmRoll01Icon,
  MaskTheater01Icon,
  PopcornIcon,
  StarIcon,
  Ticket01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { AvatarKey } from "@/types";

/** The fixed avatar set. Class strings stay literal so Tailwind generates them. */
export const AVATARS: Record<AvatarKey, { label: string; icon: IconSvgElement; className: string }> = {
  lamp: { label: "Lamp", icon: BulbIcon, className: "bg-avatar-1" },
  reel: { label: "Reel", icon: FilmRoll01Icon, className: "bg-avatar-2" },
  ticket: { label: "Ticket", icon: Ticket01Icon, className: "bg-avatar-3" },
  clapper: { label: "Clapper", icon: ClapperboardIcon, className: "bg-avatar-4" },
  star: { label: "Star", icon: StarIcon, className: "bg-avatar-5" },
  mask: { label: "Mask", icon: MaskTheater01Icon, className: "bg-avatar-6" },
  popcorn: { label: "Popcorn", icon: PopcornIcon, className: "bg-avatar-7" },
  camera: { label: "Camera", icon: Camera01Icon, className: "bg-avatar-8" },
};

export function ProfileAvatar({
  avatar,
  className,
  iconClassName,
}: {
  avatar: AvatarKey;
  className?: string;
  iconClassName?: string;
}) {
  const entry = AVATARS[avatar] ?? AVATARS.lamp;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md text-primary-foreground",
        entry.className,
        className,
      )}
    >
      <span className="film-grain absolute inset-0 opacity-30" />
      <HugeiconsIcon icon={entry.icon} strokeWidth={1.75} className={cn("relative size-1/2", iconClassName)} />
    </span>
  );
}
