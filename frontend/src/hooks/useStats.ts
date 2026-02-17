import { useQuery } from '@tanstack/react-query'

interface Stats {
  sources: number
  chunks: number
  items: number
  entities: number
  projects: number
  agents: number
  runs: number
  artifacts: number
  collections: number
}

async function fetchStats(): Promise<Stats> {
  const response = await fetch('http://localhost:3001/stats')
  if (!response.ok) {
    throw new Error('Failed to fetch stats')
  }
  return response.json()
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}
