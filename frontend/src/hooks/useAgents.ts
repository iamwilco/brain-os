import { useQuery } from '@tanstack/react-query'
import { agentsApi } from '@/lib/api'

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
    refetchInterval: 10000, // Refresh every 10 seconds for live status
  })
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => agentsApi.get(id),
    enabled: !!id,
  })
}
