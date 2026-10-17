import Link from "next/link";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A kit `Button` rendered as a Next `Link`, with the shared press feedback. */
export function LinkButton({
  href,
  children,
  variant,
  size,
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      size={size}
      render={<Link href={href} />}
      className={cn(
        "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100",
        className,
      )}
    >
      {children}
    </Button>
  );
}
