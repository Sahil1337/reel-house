"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { useMyListStatus, useToggleMyList } from "@/hooks/queries/activity";
import { cn } from "@/lib/utils";

/** Toggles a title in the profile's My List (optimistic, with a toast and server refresh). */
export function MyListButton({
  profileId,
  contentId,
  title,
  initialInMyList,
  iconOnly = false,
  size = "lg",
  variant = "outline",
  className,
}: {
  profileId: number;
  contentId: number;
  title: string;
  initialInMyList: boolean;
  iconOnly?: boolean;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const inList = useMyListStatus(profileId, contentId, initialInMyList);
  const { mutateAsync, isPending } = useToggleMyList(profileId, contentId);

  const toggle = async () => {
    const next = !inList;
    try {
      await mutateAsync(next);
      toast.success(next ? `Added ${title} to My List` : `Removed ${title} from My List`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update My List.");
    }
  };

  const label = inList ? "Remove from My List" : "Add to My List";
  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? "icon-lg" : size}
      onClick={toggle}
      disabled={isPending}
      aria-pressed={inList}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={cn("transition-transform duration-150 active:scale-[0.97]", className)}
    >
      <HugeiconsIcon
        key={inList ? "in" : "out"}
        icon={inList ? Tick02Icon : Add01Icon}
        strokeWidth={2}
        className="animate-[pop-in_200ms_var(--ease-out-strong)_both] motion-reduce:animate-none"
      />
      {iconOnly ? null : inList ? "In My List" : "My List"}
    </Button>
  );
}
