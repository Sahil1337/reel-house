"use client";

import { useId, useState, type FormEvent } from "react";

import { FormAlert } from "@/components/auth/form-alert";
import { SqlPreview } from "@/components/admin/sql-preview";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useContentEditable, useUpdateContent } from "@/hooks/queries/admin-content";
import { ApiError } from "@/lib/api/client";
import { buildUpdateContentSql } from "@/lib/sql/admin-content";
import { AGE_RATINGS, updateContentSchema } from "@/lib/validation/admin";
import type { AdminContentRow, UpdateContentInput } from "@/types";

const NONE = "none";
const RATING_ITEMS = [{ value: NONE, label: "None" }, ...AGE_RATINGS.map((code) => ({ value: code, label: code }))];

/** The form's fields as the inputs hold them: strings only ("" means empty / none). */
interface FormFields {
  title: string;
  description: string;
  releaseDate: string;
  ageRating: string;
  posterUrl: string;
  backdropUrl: string;
}

type FieldName = keyof FormFields;

const FIELD_NAMES: FieldName[] = ["title", "description", "releaseDate", "ageRating", "posterUrl", "backdropUrl"];

/** The payload value for a field: empty optional fields become null (NULL in the column). */
function payloadValue(field: FieldName, value: string): string | null {
  const trimmed = field === "description" ? value : value.trim();
  if (field === "title" || field === "description") return trimmed;
  return trimmed === "" || trimmed === NONE ? null : trimmed;
}

/**
 * Edit a title's details. Controlled by the table: `row` is the title being edited, null when closed.
 * Description and backdrop aren't in the list row, so the form loads them when it opens.
 */
export function EditContentDialog({
  row,
  onOpenChange,
}: {
  row: AdminContentRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Keep the last title while the closing animation plays, so the text doesn't blank out.
  const [shown, setShown] = useState(row);
  if (row && row !== shown) setShown(row);

  return (
    <Dialog open={row !== null} onOpenChange={(open) => onOpenChange(open)}>
      <DialogPopup className="sm:max-w-2xl">
        {shown ? <EditBody key={shown.contentId} row={shown} onClose={() => onOpenChange(false)} /> : null}
      </DialogPopup>
    </Dialog>
  );
}

function EditBody({ row, onClose }: { row: AdminContentRow; onClose: () => void }) {
  const editable = useContentEditable(row.contentId);

  if (editable.data) {
    const initial: FormFields = {
      title: row.title,
      description: editable.data.description,
      releaseDate: row.releaseDate ?? "",
      ageRating: row.ageRating ?? NONE,
      posterUrl: row.posterUrl ?? "",
      backdropUrl: editable.data.backdropUrl ?? "",
    };
    return <EditForm row={row} initial={initial} onClose={onClose} />;
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {row.title}</DialogTitle>
        <DialogDescription>Loading the current details…</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-6" aria-busy={editable.isPending}>
        {editable.isError ? (
          <div className="flex flex-col items-start gap-3">
            <FormAlert>
              {editable.error instanceof ApiError ? editable.error.message : "Couldn't load this title's details."}
            </FormAlert>
            <Button variant="outline" size="sm" onClick={() => void editable.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </>
        )}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button disabled>Save changes</Button>
      </DialogFooter>
    </>
  );
}

function EditForm({ row, initial, onClose }: { row: AdminContentRow; initial: FormFields; onClose: () => void }) {
  const [fields, setFields] = useState<FormFields>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const update = useUpdateContent();
  const saving = update.isPending;
  const ratingLabelId = useId();

  // Only what differs from what was loaded goes to the server (and into the SQL below).
  const changed = FIELD_NAMES.filter((name) => payloadValue(name, fields[name]) !== payloadValue(name, initial[name]));
  const candidate = Object.fromEntries(changed.map((name) => [name, payloadValue(name, fields[name])]));
  const parsed = changed.length ? updateContentSchema.safeParse(candidate) : null;
  const changes: UpdateContentInput | null = parsed?.success ? parsed.data : null;

  const errors: Partial<Record<FieldName, string>> = {};
  if (submitted && parsed && !parsed.success) {
    for (const issue of parsed.error.issues) {
      const name = issue.path[0] as FieldName | undefined;
      if (name && !errors[name]) errors[name] = issue.message;
    }
  }

  const set = (name: FieldName, value: string) => setFields((current) => ({ ...current, [name]: value }));
  const touchesKey = changed.includes("title") || changed.includes("releaseDate");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !changed.length) return;
    setSubmitted(true);
    setFormError(null);
    if (!changes) return;
    try {
      await update.mutateAsync({ contentId: row.contentId, title: row.title, changes });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Couldn't save the changes. Try again.");
    }
  }

  return (
    <form noValidate onSubmit={save} className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>Edit {row.title}</DialogTitle>
        <DialogDescription>
          Change the details people see. Only the fields you edit are saved; the type (
          {row.contentType === "MOVIE" ? "movie" : "series"}) can&rsquo;t change because seasons and episodes hang off
          it.
        </DialogDescription>
      </DialogHeader>

      <DialogPanel className="flex flex-col gap-6">
        <Field invalid={Boolean(errors.title)}>
          <FieldLabel>Title</FieldLabel>
          <Input
            name="title"
            autoComplete="off"
            maxLength={255}
            value={fields.title}
            onValueChange={(value) => set("title", value)}
          />
          {errors.title ? <FieldError match>{errors.title}</FieldError> : null}
        </Field>

        <Field invalid={Boolean(errors.description)}>
          <FieldLabel>Description</FieldLabel>
          <Textarea
            name="description"
            rows={4}
            value={fields.description}
            onChange={(event) => set("description", event.target.value)}
          />
          {errors.description ? <FieldError match>{errors.description}</FieldError> : null}
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field invalid={Boolean(errors.releaseDate)}>
            <FieldLabel>Release date</FieldLabel>
            <Input
              name="release-date"
              type="date"
              value={fields.releaseDate}
              onValueChange={(value) => set("releaseDate", value)}
            />
            {errors.releaseDate ? <FieldError match>{errors.releaseDate}</FieldError> : null}
          </Field>

          <div className="flex flex-col items-start gap-2">
            <p className="text-sm/4 font-medium" id={ratingLabelId}>
              Age rating
            </p>
            <Select
              items={RATING_ITEMS}
              value={fields.ageRating}
              onValueChange={(value: string | null) => set("ageRating", value ?? NONE)}
            >
              <SelectTrigger aria-labelledby={ratingLabelId}>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {RATING_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {errors.ageRating ? <p className="text-xs text-destructive-foreground">{errors.ageRating}</p> : null}
          </div>
        </div>

        <Field invalid={Boolean(errors.posterUrl)}>
          <FieldLabel>Poster URL</FieldLabel>
          <Input
            name="poster-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://…"
            value={fields.posterUrl}
            onValueChange={(value) => set("posterUrl", value)}
          />
          {errors.posterUrl ? <FieldError match>{errors.posterUrl}</FieldError> : null}
          <FieldDescription>Leave empty for no poster.</FieldDescription>
        </Field>

        <Field invalid={Boolean(errors.backdropUrl)}>
          <FieldLabel>Backdrop URL</FieldLabel>
          <Input
            name="backdrop-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://…"
            value={fields.backdropUrl}
            onValueChange={(value) => set("backdropUrl", value)}
          />
          {errors.backdropUrl ? <FieldError match>{errors.backdropUrl}</FieldError> : null}
        </Field>

        {formError ? <FormAlert>{formError}</FormAlert> : null}

        {changes ? (
          <SqlPreview
            statements={buildUpdateContentSql(row.contentId, changes)}
            notes={[
              "One statement, atomic. Only the fields you changed are in the SET list; values are bound as parameters.",
              "The title, type and release date must stay unique together (UNIQUE NULLS NOT DISTINCT). Colliding with another title is rejected with a 409 and nothing is changed.",
              "age_rating must be one of the 12 US certificates or empty; the maturity level profiles are filtered by is derived from it, so a change applies immediately.",
              ...(touchesKey
                ? [
                    "Renaming or re-dating a title detaches it from TMDB matching: importing the original title again adds a second row.",
                  ]
                : []),
            ]}
          />
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {changed.length
              ? "Fix the highlighted fields to see the UPDATE this will run."
              : "Change a field to see the UPDATE it will run."}
          </p>
        )}
      </DialogPanel>

      <DialogFooter>
        <DialogClose render={<Button variant="ghost" disabled={saving} />}>Cancel</DialogClose>
        <Button type="submit" loading={saving} disabled={changed.length === 0}>
          Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}
