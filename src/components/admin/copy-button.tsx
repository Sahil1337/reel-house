"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Copies `text` and flips to a "Copied" tick for a moment. */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "ghost",
  size = "xs",
  className,
}: {
  text: string | (() => string);
  label?: string;
  copiedLabel?: string;
  variant?: "ghost" | "outline";
  size?: "xs" | "sm";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it by hand.");
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={copy}
      aria-live="polite"
      className={cn("transition-colors duration-150", copied && "text-success-foreground", className)}
    >
      <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={2} />
      {copied ? copiedLabel : label}
    </Button>
  );
}
