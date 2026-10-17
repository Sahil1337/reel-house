"use client";

import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { OnboardingInput, Profile, ProfileInput } from "@/types";

/** The signed-in user's profiles, seeded from the server-rendered list and kept in sync by the mutations below (never refetched). */
export function useProfileList(initial: Profile[]) {
  const { data } = useQuery<Profile[]>({
    queryKey: queryKeys.profile.list(),
    queryFn: skipToken,
    initialData: initial,
    staleTime: Infinity,
    gcTime: 0,
  });
  // skipToken opts out of the defined-data overload, so `data` is typed as possibly undefined.
  return { data: data ?? initial };
}

/** Creates (`profileId` null) or updates a profile and merges the result into the cached list. */
export function useSaveProfile() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, input }: { profileId: number | null; input: ProfileInput }): Promise<Profile> => {
      const { profile } =
        profileId === null ? await api.createProfile(input) : await api.updateProfile(profileId, input);
      return profile;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<Profile[]>(queryKeys.profile.list(), (current = []) =>
        current.some((entry) => entry.profileId === saved.profileId)
          ? current.map((entry) => (entry.profileId === saved.profileId ? { ...entry, ...saved } : entry))
          : [...current, saved],
      );
      router.refresh();
    },
  });
}

/** Deletes a profile and removes it from the cached list. */
export function useDeleteProfile() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: number) => api.deleteProfile(profileId),
    onSuccess: (_data, profileId) => {
      queryClient.setQueryData<Profile[]>(queryKeys.profile.list(), (current = []) =>
        current.filter((entry) => entry.profileId !== profileId),
      );
      router.refresh();
    },
  });
}

/** Saves a profile's first genre picks, then opens Home. */
export function useCompleteOnboarding(profile: Profile) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OnboardingInput) => api.completeOnboarding(profile.profileId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.all(profile.profileId) });
      router.push("/browse");
      router.refresh();
    },
  });
}
