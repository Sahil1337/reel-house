"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LockPasswordIcon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import type { InputProps } from "@/components/ui/input";

/** Password field with a lock addon and a show/hide toggle. */
export function PasswordInput(props: Omit<InputProps, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup>
      <InputGroupAddon>
        <HugeiconsIcon icon={LockPasswordIcon} strokeWidth={2} className="size-4" />
      </InputGroupAddon>
      <InputGroupInput type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <Button
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
          size="icon-xs"
          variant="ghost"
        >
          <HugeiconsIcon icon={visible ? ViewOffIcon : ViewIcon} strokeWidth={2} className="size-4" />
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
