import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { SourceDetail } from "@/components/sources/SourceDetail"
import { Loader2, ArrowLeft } from "lucide-react"

async function fetchSource(id: string) {
  const response = await fetch(`http://localhost:3001/sources/${id}`)
  if (!response.ok) throw new Error('Failed to fetch source')
  return response.json()
}

export function SourceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: source, isLoading, error } = useQuery({
    queryKey: ['sources', id],
    queryFn: () => fetchSource(id || ''),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !source) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Source not found</p>
        <button 
          onClick={() => navigate('/sources')}
          className="text-sm text-primary hover:underline"
        >
          Back to sources
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/sources')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to sources
      </button>
      <SourceDetail
        collection={{
          id: source.id,
          name: source.name,
          type: source.type,
          status: source.status,
          sourceCount: source.counts?.conversations || 0,
          itemCount: source.counts?.items || 0,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        }}
        conversations={[]}
        isLoading={isLoading}
        onBack={() => navigate('/sources')}
        onConversationClick={(conv) => navigate(`/sources/${id}/conversations/${conv.id}`)}
        onReExtract={() => {
          // TODO: Call extraction API
        }}
      />
    </div>
  )
}
