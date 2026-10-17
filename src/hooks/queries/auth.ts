"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api } from "@/lib/api/client";

/** Signs in, drops any previous user's cached data, then navigates to `next` (admins default to /admin, others to /profiles). */
export function useSignIn(next: string | null) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.signIn,
    onSuccess: ({ user }) => {
      queryClient.clear();
      router.push(next ?? (user.role === "ADMIN" ? "/admin" : "/profiles"));
      router.refresh();
    },
  });
}

/** Creates the account; the caller decides where to go next. */
export function useSignUp() {
  return useMutation({ mutationFn: api.signUp });
}

/** Signs out, clears every cached query and returns to the landing page. */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.signOut,
    onSuccess: () => {
      queryClient.clear();
      router.push("/");
      router.refresh();
    },
    onError: () => {
      toast.error("Couldn't sign you out. Check your connection and try again.");
    },
  });
}
