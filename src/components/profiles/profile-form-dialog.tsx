"use client";

import { useId, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { useDeleteProfile, useSaveProfile } from "@/hooks/queries/profiles";
import { MATURITY_LABELS } from "@/lib/content/maturity";
import { profileSchema } from "@/lib/validation/profile";
import type { MaturityLevel, Profile, ProfileInput } from "@/types";

import { AvatarPicker } from "./avatar-picker";
import { ProfileAvatar } from "./profile-avatar";

const MATURITY_HINTS: Record<MaturityLevel, string> = {
  KIDS: "Only titles rated for children, such as G, PG and TV-Y.",
  TEEN: "Adds titles rated PG-13 and TV-14.",
  ADULT: "Everything in the catalogue.",
};
const MATURITY_LEVELS = Object.keys(MATURITY_LABELS) as MaturityLevel[];

const NEW_PROFILE: ProfileInput = { name: "", avatar: "reel", maturityLevel: "ADULT" };

/**
 * Create or edit a profile. `profile` null means "create".
 * The dialog body unmounts on close, so every open starts from fresh state.
 */
export function ProfileFormDialog({
  open,
  onOpenChange,
  profile,
  canDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  canDelete: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogPopup className="sm:max-w-md">
        <ProfileForm
          key={profile?.profileId ?? "new"}
          profile={profile}
          canDelete={canDelete}
          onDone={() => onOpenChange(false)}
        />
      </DialogPopup>
    </Dialog>
  );
}

function ProfileForm({
  profile,
  canDelete,
  onDone,
}: {
  profile: Profile | null;
  canDelete: boolean;
  onDone: () => void;
}) {
  const [fields, setFields] = useState<ProfileInput>(() =>
    profile
      ? {
          name: profile.name,
          avatar: profile.avatar,
          maturityLevel: profile.maturityLevel,
        }
      : NEW_PROFILE,
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const saveProfile = useSaveProfile();
  const deleteProfile = useDeleteProfile();
  const saving = saveProfile.isPending;
  const deleting = deleteProfile.isPending;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const maturityLabelId = useId();

  const update = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const parsed = profileSchema.safeParse(fields);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((entry) => entry.path[0] === "name");
      setNameError(issue?.message ?? null);
      if (!issue) setFormError("Some details aren't valid. Check the form and try again.");
      return;
    }
    setNameError(null);
    setFormError(null);
    try {
      const saved = await saveProfile.mutateAsync({ profileId: profile?.profileId ?? null, input: parsed.data });
      toast.success(profile ? `Saved changes to ${saved.name}` : `Added ${saved.name}`);
      onDone();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Couldn't save the profile. Try again.");
    }
  }

  async function remove() {
    if (!profile) return;
    try {
      await deleteProfile.mutateAsync(profile.profileId);
      toast.success(`Deleted ${profile.name}`);
      setConfirmOpen(false);
      onDone();
    } catch (error) {
      setConfirmOpen(false);
      setFormError(error instanceof Error ? error.message : "Couldn't delete the profile. Try again.");
    }
  }

  return (
    <form noValidate onSubmit={save} className="flex min-h-0 flex-col">
      <DialogHeader className="flex-row items-center gap-4">
        <ProfileAvatar avatar={fields.avatar} className="size-12 rounded-lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <DialogTitle>{profile ? `Edit ${profile.name}` : "Add a profile"}</DialogTitle>
          <DialogDescription>
            {profile
              ? "Changes apply the next time this profile opens Reelhouse."
              : "Each profile gets its own history, list, ratings and recommendations."}
          </DialogDescription>
        </div>
      </DialogHeader>

      <DialogPanel className="flex flex-col gap-6">
        <Field invalid={Boolean(nameError)}>
          <FieldLabel>Name</FieldLabel>
          <Input
            name="profile-name"
            autoComplete="off"
            maxLength={24}
            placeholder="e.g. Kabir"
            value={fields.name}
            onValueChange={(value) => update("name", value)}
          />
          {nameError ? <FieldError match>{nameError}</FieldError> : null}
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Avatar</p>
          <AvatarPicker value={fields.avatar} onValueChange={(value) => update("avatar", value)} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium" id={maturityLabelId}>
            Maturity
          </p>
          <RadioGroup
            aria-labelledby={maturityLabelId}
            value={fields.maturityLevel}
            onValueChange={(value) => update("maturityLevel", value as MaturityLevel)}
            className="gap-2"
          >
            {MATURITY_LEVELS.map((level) => (
              <Label
                key={level}
                className="cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 font-normal transition-colors duration-150 hover-fine:bg-accent/50 has-data-checked:border-primary/60 has-data-checked:bg-primary/6"
              >
                <Radio value={level} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{MATURITY_LABELS[level]}</span>
                  <span className="text-xs text-muted-foreground">{MATURITY_HINTS[level]}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {profile && !canDelete ? (
          <p className="text-xs text-muted-foreground">
            An account needs at least one profile, so this one can&rsquo;t be deleted.
          </p>
        ) : null}
        {formError ? <FormAlert>{formError}</FormAlert> : null}
      </DialogPanel>

      <DialogFooter className="sm:items-center">
        {profile ? (
          <AlertDialog open={confirmOpen} onOpenChange={(next) => setConfirmOpen(next)}>
            <AlertDialogTrigger
              disabled={!canDelete}
              render={<Button variant="destructive-outline" className="sm:mr-auto" />}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Delete profile
            </AlertDialogTrigger>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {profile.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Their history, list and ratings will be removed. This can&rsquo;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="ghost" />}>Keep profile</AlertDialogClose>
                <Button variant="destructive" loading={deleting} onClick={remove}>
                  Delete {profile.name}
                </Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
        ) : null}
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button type="submit" loading={saving}>
          {profile ? "Save changes" : "Add profile"}
        </Button>
      </DialogFooter>
    </form>
  );
}
