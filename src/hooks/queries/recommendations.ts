import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

/** The "Why these picks?" breakdown; only fetched while `enabled` (the panel is open), and always fresh. */
export function useHomeExplanation(profileId: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.profile.homeExplanation(profileId),
    queryFn: () => api.getHomeExplanation(profileId),
    enabled,
    staleTime: 0,
  });
}
