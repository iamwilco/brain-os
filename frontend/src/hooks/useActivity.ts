import { useQuery } from '@tanstack/react-query'
import { runsApi, type Run } from '@/lib/api'

export interface ActivityItem {
  id: string
  type: 'run' | 'import' | 'agent'
  action: string
  status: string
  timestamp: string
  description: string
  runId?: string
  agentId?: string | null
}

function runsToActivity(runs: Run[]): ActivityItem[] {
  return runs.map((run) => ({
    id: run.id,
    type: 'run' as const,
    action: run.action,
    status: run.status,
    timestamp: run.startedAt,
    description: `${run.action} - ${run.status}`,
    runId: run.id,
    agentId: run.agentId,
  }))
}

export function useRecentActivity(limit = 10) {
  const runsQuery = useQuery({
    queryKey: ['runs', { limit }],
    queryFn: () => runsApi.list({ limit }),
  })

  const activities: ActivityItem[] = runsQuery.data
    ? runsToActivity(runsQuery.data.data)
    : []

  return {
    activities,
    isLoading: runsQuery.isLoading,
    error: runsQuery.error,
    refetch: runsQuery.refetch,
  }
}
