"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { Badge } from "@/components/ui/badge";
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
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import { useActivationPoll, useStartCheckout, useVerifyPayment } from "@/hooks/queries/billing";
import { formatCurrency } from "@/lib/format";
import {
  cssTokenToHex,
  RAZORPAY_CHECKOUT_SRC,
  toRazorpayContact,
  type RazorpaySuccessResponse,
} from "@/lib/razorpay/checkout";
import { cn } from "@/lib/utils";
import type { CheckoutOrder, SubscriptionPlan, SubscriptionWithPlan, User } from "@/types";

import { PlanFeatureList } from "./plan-features";

const PRESS =
  "transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100";

type Notice = { tone: "error" | "info"; message: string };

/** Where the purchase is. While Razorpay Checkout is open ("checkout") our dialog is closed. */
type Phase =
  | { step: "confirm"; notice: Notice | null }
  | { step: "starting" }
  | { step: "checkout" }
  | { step: "verifying" }
  | { step: "confirming"; subscriptionId: number; paymentId: string }
  | { step: "active" }
  | { step: "received"; paymentId: string }
  | { step: "unverified"; message: string };

/** Plan cards; picking another plan opens a confirm dialog, then Razorpay Checkout. */
export function ChangePlan({
  user,
  plans,
  current,
  onChanged,
}: {
  user: User;
  plans: SubscriptionPlan[];
  current: SubscriptionWithPlan | null;
  onChanged: (subscription: SubscriptionWithPlan) => void;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<SubscriptionPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ step: "confirm", notice: null });
  const [scriptFailed, setScriptFailed] = useState(false);

  const startCheckout = useStartCheckout().mutateAsync;
  const verifyPayment = useVerifyPayment().mutateAsync;
  const poll = useActivationPoll(phase.step === "confirming" ? phase.subscriptionId : null);

  // Once the activation poll settles the dialog shows the active plan, or falls back to "received" if the plan
  // never turned ACTIVE.
  // TODO(backend): with the stubs nothing is persisted, so the plan never turns ACTIVE and we always end in
  // "received". Once verify / the webhook write the payment (src/app/api/payments/*), the poll finds it.
  const view: Phase =
    phase.step === "confirming" && poll.settled
      ? poll.subscription
        ? { step: "active" }
        : { step: "received", paymentId: phase.paymentId }
      : phase;

  const onPollSettled = useEffectEvent(() => {
    if (poll.subscription) onChanged(poll.subscription);
    router.refresh();
  });

  useEffect(() => {
    if (phase.step === "confirming" && poll.settled) onPollSettled();
  }, [phase.step, poll.settled]);

  const busy = phase.step === "starting" || phase.step === "checkout" || phase.step === "verifying";

  function choose(plan: SubscriptionPlan) {
    setTarget(plan);
    setPhase({ step: "confirm", notice: null });
    setOpen(true);
  }

  async function pay(plan: SubscriptionPlan) {
    setPhase({ step: "starting" });
    let order: CheckoutOrder;
    try {
      order = await startCheckout({ planId: plan.planId });
    } catch (error) {
      setPhase({ step: "confirm", notice: { tone: "error", message: checkoutErrorMessage(error) } });
      return;
    }

    // TODO(backend): the checkout stub returns no Razorpay key, so there is no real order to pay; skip
    // Checkout and go straight to verify. Once POST /api/account/subscriptions creates real orders, keyId is set.
    if (!order.keyId) {
      void confirmPayment(plan, order, {
        razorpay_order_id: order.orderId,
        razorpay_payment_id: order.orderId.replace("order_", "pay_"),
        razorpay_signature: "demo",
      });
      return;
    }

    if (!window.Razorpay) {
      const message = scriptFailed
        ? "Couldn't load Razorpay Checkout. Check your connection (or an ad blocker) and reload the page."
        : "Razorpay Checkout is still loading. Try again in a moment.";
      setPhase({ step: "confirm", notice: { tone: "error", message } });
      return;
    }

    let paid = false;
    let lastFailure: string | null = null;
    const checkout = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "Reelhouse",
      description: `${plan.name} plan`,
      prefill: { name: user.name, email: user.email, contact: toRazorpayContact(user.phone) },
      theme: { color: cssTokenToHex("--primary") },
      handler: (response) => {
        paid = true;
        void confirmPayment(plan, order, response);
      },
      modal: {
        ondismiss: () => {
          if (paid) return;
          setPhase({
            step: "confirm",
            notice: lastFailure
              ? { tone: "error", message: `Payment failed: ${lastFailure}` }
              : { tone: "info", message: "Checkout closed before paying. You haven't been charged." },
          });
          setOpen(true);
        },
      },
    });
    // Checkout stays open after a failed attempt so the customer can retry; remember the reason for ondismiss.
    checkout.on("payment.failed", ({ error }) => {
      lastFailure = error.description || "Razorpay declined the payment.";
      toast.error("Payment failed", { description: lastFailure });
    });

    // Close our dialog first: its focus trap would otherwise fight Razorpay's iframe for focus.
    setOpen(false);
    setPhase({ step: "checkout" });
    checkout.open();
  }

  async function confirmPayment(plan: SubscriptionPlan, order: CheckoutOrder, response: RazorpaySuccessResponse) {
    setPhase({ step: "verifying" });
    setOpen(true);
    try {
      await verifyPayment(response);
    } catch (error) {
      const reason =
        error instanceof ApiError && error.status === 400
          ? "Razorpay took the payment, but its signature didn't check out on our side."
          : "Razorpay took the payment, but we couldn't reach the server to confirm it.";
      setPhase({
        step: "unverified",
        message: `${reason} Don't pay again: Razorpay's webhook records payment ${response.razorpay_payment_id} on its own.`,
      });
      return;
    }

    toast.success("Payment verified", { description: `${plan.name} · ${formatCurrency(order.amount / 100)}` });
    setPhase({ step: "confirming", subscriptionId: order.subscriptionId, paymentId: response.razorpay_payment_id });
  }

  return (
    <>
      <Script src={RAZORPAY_CHECKOUT_SRC} onError={() => setScriptFailed(true)} />

      <ul className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = current?.planId === plan.planId;
          return (
            <li
              key={plan.planId}
              className={cn(
                "flex flex-col gap-5 rounded-2xl border bg-card p-5",
                isCurrent && "border-primary/40 ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-wide">{plan.name}</h3>
                  <p className="flex items-baseline gap-1">
                    <span className="font-mono text-lg font-semibold tabular-nums">
                      {formatCurrency(plan.priceMonthly)}
                    </span>
                    <span className="text-xs text-muted-foreground">/month</span>
                  </p>
                </div>
                {isCurrent ? <Badge variant="outline">Current plan</Badge> : null}
              </div>
              <PlanFeatureList plan={plan} />
              <Button
                variant={isCurrent ? "outline" : "default"}
                disabled={isCurrent || busy}
                className={cn("mt-auto w-full", PRESS)}
                onClick={() => choose(plan)}
              >
                {isCurrent ? "Your current plan" : current ? `Switch to ${plan.name}` : `Choose ${plan.name}`}
              </Button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Creating the order: closing now would still open Checkout a moment later.
          if (!next && phase.step === "starting") return;
          setOpen(next);
        }}
      >
        <DialogPopup className="sm:max-w-md">
          {target ? (
            <PlanCheckoutDialog plan={target} current={current} phase={view} onPay={() => void pay(target)} />
          ) : null}
        </DialogPopup>
      </Dialog>
    </>
  );
}

function PlanCheckoutDialog({
  plan,
  current,
  phase,
  onPay,
}: {
  plan: SubscriptionPlan;
  current: SubscriptionWithPlan | null;
  phase: Phase;
  onPay: () => void;
}) {
  const doneButton = <DialogClose render={<Button className={PRESS} />}>Done</DialogClose>;

  switch (phase.step) {
    case "verifying":
    case "confirming":
      return (
        <>
          <DialogHeader>
            <DialogTitle>{phase.step === "verifying" ? "Checking your payment" : "Payment verified"}</DialogTitle>
            <DialogDescription>
              {phase.step === "verifying"
                ? "Confirming the payment with Razorpay. This takes a second."
                : `Switching your account to ${plan.name}…`}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              {phase.step === "verifying" ? "Verifying" : "Waiting for your plan to switch on"}
            </p>
          </DialogPanel>
        </>
      );

    case "active":
      return (
        <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-5 text-primary" />
              You&rsquo;re on {plan.name}
            </DialogTitle>
            <DialogDescription>Payment received and your plan is active. It renews monthly.</DialogDescription>
          </DialogHeader>
          <DialogFooter>{doneButton}</DialogFooter>
        </>
      );

    case "received":
      return (
        <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-5 text-primary" />
              Payment verified
            </DialogTitle>
            <DialogDescription>Payment received — your plan updates once it&rsquo;s recorded.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <p className="text-xs text-muted-foreground">
              Razorpay payment <span className="font-mono text-foreground">{phase.paymentId}</span> for {plan.name}.
            </p>
          </DialogPanel>
          <DialogFooter>{doneButton}</DialogFooter>
        </>
      );

    case "unverified":
      return (
        <>
          <DialogHeader>
            <DialogTitle>Couldn&rsquo;t confirm the payment</DialogTitle>
            <DialogDescription>Your plan will update once Razorpay reports the payment.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <FormAlert>{phase.message}</FormAlert>
          </DialogPanel>
          <DialogFooter>{doneButton}</DialogFooter>
        </>
      );

    default: {
      // "confirm" and "starting" (and "checkout", while the dialog animates out).
      const notice = phase.step === "confirm" ? phase.notice : null;
      return (
        <>
          <DialogHeader>
            <DialogTitle>{current ? `Switch to ${plan.name}` : `Start ${plan.name}`}</DialogTitle>
            <DialogDescription>
              {current
                ? `Your ${current.plan.name} plan ends and ${plan.name} starts as soon as the payment goes through, renewing monthly.`
                : `${plan.name} starts as soon as the payment goes through and renews monthly.`}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-5">
            <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Due today</span>
              <span className="font-mono text-lg font-semibold tabular-nums">{formatCurrency(plan.priceMonthly)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              You&rsquo;ll pay on Razorpay&rsquo;s secure checkout — card, UPI, net banking or wallet. This demo runs in
              Razorpay test mode, so no real money moves.
            </p>
            {notice?.tone === "error" ? <FormAlert>{notice.message}</FormAlert> : null}
            {notice?.tone === "info" ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
              >
                <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
                <span>{notice.message}</span>
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button onClick={onPay} loading={phase.step !== "confirm"} className={PRESS}>
              Pay {formatCurrency(plan.priceMonthly)}
            </Button>
          </DialogFooter>
        </>
      );
    }
  }
}

/** The message for a failed POST /api/account/subscriptions. */
function checkoutErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Couldn't reach the server. Check your connection and try again.";
}
