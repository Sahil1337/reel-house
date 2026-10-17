import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { User } from "@/types";

export function AccountDetailsCard({ user, profileCount }: { user: User; profileCount: number }) {
  const rows = [
    { label: "Name", value: user.name },
    { label: "Email", value: user.email },
    { label: "Phone", value: user.phone ?? "Not added" },
    { label: "Member since", value: formatDate(user.createdAt) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />}>Account details</CardTitle>
        <CardDescription>
          {profileCount} {profileCount === 1 ? "profile" : "profiles"} on this account
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" render={<Link href="/profiles?manage=1" />}>
            <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
            Manage profiles
          </Button>
        </CardAction>
      </CardHeader>
      <CardPanel>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="truncate text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardPanel>
    </Card>
  );
}
