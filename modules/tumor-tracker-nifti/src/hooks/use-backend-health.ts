import { useQuery } from "@tanstack/react-query";
import { api, apiBase } from "@/lib/neuro/api";

export function useBackendHealth() {
  return useQuery({
    queryKey: ["backend-health"],
    queryFn: () => api.health(),
    enabled: !!apiBase(),
    retry: false,
    staleTime: 30000,
  });
}
