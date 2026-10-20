"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mail01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useSignIn } from "@/hooks/queries/auth";
import { signInSchema } from "@/lib/validation/auth";

import { FormAlert } from "./form-alert";
import { PasswordInput } from "./password-input";

const DEMO_ACCOUNTS = [
  { label: "Use demo account", email: "demo@reelhouse.dev", password: "demo1234" },
  { label: "Use admin account", email: "admin@reelhouse.dev", password: "admin1234" },
] as const;

type FieldErrors = Partial<Record<"email" | "password", string>>;

/** `next` is where the visitor was headed; without one, admins land on /admin and everyone else on /profiles. */
export function SignInForm({ next }: { next: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { mutateAsync, isPending, isSuccess } = useSignIn(next);
  const pending = isPending || isSuccess;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    try {
      await mutateAsync(parsed.data);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Couldn't sign you in. Try again.");
    }
  }

  function fillDemoAccount(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setFieldErrors({});
    setFormError(null);
  }

  return (
    <Card className="w-full max-w-sm animate-[fade-up_360ms_var(--ease-out-strong)_both] motion-reduce:animate-none">
      <CardHeader>
        <CardTitle render={<h1 />} className="font-display text-3xl font-bold uppercase tracking-wide">
          Welcome back
        </CardTitle>
        <CardDescription>Sign in to pick up where you left off.</CardDescription>
      </CardHeader>
      <CardPanel>
        <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field invalid={Boolean(fieldErrors.email)}>
            <FieldLabel>Email</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onValueChange={(value) => setEmail(value)}
              />
            </InputGroup>
            {fieldErrors.email ? <FieldError match>{fieldErrors.email}</FieldError> : null}
          </Field>

          <Field invalid={Boolean(fieldErrors.password)}>
            <FieldLabel>Password</FieldLabel>
            <PasswordInput
              name="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onValueChange={(value) => setPassword(value)}
            />
            {fieldErrors.password ? <FieldError match>{fieldErrors.password}</FieldError> : null}
          </Field>

          {formError ? <FormAlert>{formError}</FormAlert> : null}

          <Button
            type="submit"
            size="lg"
            loading={pending}
            className="w-full transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100"
          >
            Sign in
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          <p>Trying it out? Use one of these:</p>
          {DEMO_ACCOUNTS.map((account) => (
            <div key={account.email} className="flex items-center justify-between gap-3">
              <span className="font-mono text-foreground">{account.email}</span>
              <Button size="xs" variant="outline" onClick={() => fillDemoAccount(account)}>
                {account.label}
              </Button>
            </div>
          ))}
        </div>
      </CardPanel>
      <CardFooter className="justify-center border-t text-sm text-muted-foreground">
        New to Reelhouse?
        <Link
          href="/sign-up"
          className="ms-1 rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
