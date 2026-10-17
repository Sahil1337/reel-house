import type { Metadata } from "next";

import { SignUpFlow } from "@/components/auth/sign-up-flow";

export const metadata: Metadata = { title: "Create your account" };

/** Account only: plans are bought after sign-in, from /account (Razorpay Checkout). */
export default function SignUpPage() {
  return <SignUpFlow />;
}
