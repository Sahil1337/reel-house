"use client";

import { useState } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { useCompleteOnboarding } from "@/hooks/queries/profiles";
import { ONBOARDING_MIN_GENRES } from "@/lib/constants";
import type { Genre, Profile } from "@/types";

import { GenreStep } from "./genre-step";

const PRESS =
  "transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100";

const toggle = (list: number[], id: number) =>
  list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

/** The cold start: pick at least ONBOARDING_MIN_GENRES genres, then Finish saves them and opens Home. */
export function OnboardingFlow({
  profile,
  genres,
  initialGenreIds,
}: {
  profile: Profile;
  genres: Genre[];
  initialGenreIds: number[];
}) {
  const [genreIds, setGenreIds] = useState(initialGenreIds);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { mutateAsync, isPending, isSuccess } = useCompleteOnboarding(profile);
  const submitting = isPending || isSuccess;

  async function finish() {
    if (submitting) return;
    setSubmitError(null);
    try {
      await mutateAsync({ genreIds });
      toast.success(`${profile.name}'s home is ready. Rate titles as you watch to sharpen it.`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Couldn't save your picks. Try again.");
    }
  }

  const ready = genreIds.length >= ONBOARDING_MIN_GENRES;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center gap-8 px-4 pt-6 pb-10 sm:px-8 lg:px-12">
        <div className="flex w-full max-w-6xl flex-col items-center gap-8 animate-[fade-up_360ms_var(--ease-out-strong)_both] motion-reduce:animate-none">
          <div className="flex max-w-2xl flex-col items-center gap-3 text-center">
            <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide text-balance sm:text-6xl">
              What do you like to watch?
            </h1>
            <p className="text-pretty text-sm text-muted-foreground sm:text-base">
              Pick at least {ONBOARDING_MIN_GENRES} genres so {profile.name}&rsquo;s home starts somewhere familiar.
            </p>
          </div>
          <GenreStep genres={genres} selected={genreIds} onToggle={(id) => setGenreIds((list) => toggle(list, id))} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 border-t bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-8 lg:px-12">
          {submitError ? <FormAlert className="sm:flex-1">{submitError}</FormAlert> : null}
          <div className="flex items-center justify-between gap-3 sm:ml-auto sm:gap-4">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              <PickCount count={genreIds.length} min={ONBOARDING_MIN_GENRES} />
            </p>
            <Button size="lg" onClick={finish} disabled={!ready} loading={submitting} className={PRESS}>
              Finish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PickCount({ count, min }: { count: number; min: number }) {
  if (count >= min) {
    return (
      <span>
        <span className="font-mono tabular-nums text-foreground">{count}</span> picked
      </span>
    );
  }
  return (
    <span>
      <span className="font-mono tabular-nums text-foreground">
        {count} of {min}
      </span>{" "}
      picked · pick {min - count} more to finish
    </span>
  );
}
