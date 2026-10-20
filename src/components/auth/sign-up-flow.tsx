"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Mail01Icon, SmartPhone01Icon, User03Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useSignUp } from "@/hooks/queries/auth";
import { signUpSchema } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

import { FormAlert } from "./form-alert";
import { PasswordInput } from "./password-input";
import { PasswordStrength } from "./password-strength";

type AccountField = "name" | "email" | "phone" | "password";

const PRESS =
  "transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100";

/** Creates the user and their first profile. Plans are bought later, from the account page (Razorpay). */
export function SignUpFlow() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AccountField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { mutateAsync, isPending, isSuccess } = useSignUp();
  const pending = isPending || isSuccess;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = signUpSchema.safeParse({ name, email, phone: phone.trim() || null, password });
    if (!parsed.success) {
      const errors: Partial<Record<AccountField, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as AccountField;
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    try {
      await mutateAsync({ name: name.trim(), email: email.trim(), phone: phone.trim() || null, password });
      toast.success("Account created!");
      router.push("/profiles");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Couldn't create your account. Try again.");
    }
  }

  return (
    <Card className="w-full max-w-md animate-[fade-up_360ms_var(--ease-out-strong)_both] motion-reduce:animate-none">
      <CardHeader>
        <CardTitle render={<h1 />} className="font-display text-3xl font-bold uppercase tracking-wide">
          Create your account
        </CardTitle>
        <CardDescription>You&rsquo;ll use these details to sign in on any screen.</CardDescription>
      </CardHeader>

      <CardPanel>
        <form noValidate className="flex flex-col gap-4" onSubmit={submit}>
          <Field invalid={Boolean(fieldErrors.name)}>
            <FieldLabel>Full name</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <HugeiconsIcon icon={User03Icon} strokeWidth={2} className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                name="name"
                autoComplete="name"
                placeholder="Riya Sharma"
                value={name}
                onValueChange={(value) => setName(value)}
              />
            </InputGroup>
            {fieldErrors.name ? <FieldError match>{fieldErrors.name}</FieldError> : null}
          </Field>

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

          <Field invalid={Boolean(fieldErrors.phone)}>
            <FieldLabel>
              Phone <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <HugeiconsIcon icon={SmartPhone01Icon} strokeWidth={2} className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onValueChange={(value) => setPhone(value)}
              />
            </InputGroup>
            {fieldErrors.phone ? <FieldError match>{fieldErrors.phone}</FieldError> : null}
          </Field>

          <Field invalid={Boolean(fieldErrors.password)}>
            <FieldLabel>Password</FieldLabel>
            <PasswordInput
              name="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onValueChange={(value) => setPassword(value)}
            />
            {fieldErrors.password ? <FieldError match>{fieldErrors.password}</FieldError> : null}
            <PasswordStrength password={password} />
          </Field>

          {formError ? <FormAlert>{formError}</FormAlert> : null}

          <p className="text-xs text-muted-foreground">You&rsquo;ll pick a plan from your account after signing up.</p>

          <Button type="submit" size="lg" loading={pending} className={cn("w-full", PRESS)}>
            Create account
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </form>
      </CardPanel>

      <CardFooter className="justify-center border-t text-sm text-muted-foreground">
        Already have an account?
        <Link
          href="/sign-in"
          className="ms-1 rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
