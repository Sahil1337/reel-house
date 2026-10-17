import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { PaymentStatus, SubscriptionStatus } from "@/types";

type Variant = BadgeProps["variant"];

const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; variant: Variant }> = {
  ACTIVE: { label: "Active", variant: "success" },
  PENDING: { label: "Pending", variant: "warning" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
  EXPIRED: { label: "Expired", variant: "outline" },
};

const PAYMENT_STATUS: Record<PaymentStatus, { label: string; variant: Variant }> = {
  SUCCESS: { label: "Paid", variant: "success" },
  FAILED: { label: "Failed", variant: "error" },
  REFUNDED: { label: "Refunded", variant: "info" },
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const { label, variant } = SUBSCRIPTION_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, variant } = PAYMENT_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
