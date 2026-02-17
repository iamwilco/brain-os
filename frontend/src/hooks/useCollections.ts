import { useQuery } from '@tanstack/react-query'

export interface SourceCollection {
  id: string
  name: string
  type: 'chatgpt' | 'claude' | 'folder' | 'obsidian' | 'manual'
  status: 'pending' | 'processing' | 'complete' | 'error'
  sourceCount: number
  itemCount: number
  createdAt: string
  updatedAt: string
  error?: string
}

interface CollectionsResponse {
  data: SourceCollection[]
  total: number
}

async function fetchCollections(): Promise<CollectionsResponse> {
  const response = await fetch('http://localhost:3001/sources')
  if (!response.ok) {
    throw new Error('Failed to fetch collections')
  }
  return response.json()
}

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: fetchCollections,
    refetchInterval: 15000,
  })
}
