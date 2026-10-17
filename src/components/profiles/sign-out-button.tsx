"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { useSignOut } from "@/hooks/queries/auth";

export function SignOutButton() {
  const { mutate: signOut, isPending, isSuccess } = useSignOut();

  return (
    <Button variant="ghost" onClick={() => signOut()} loading={isPending || isSuccess}>
      <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
      Sign out
    </Button>
  );
}
