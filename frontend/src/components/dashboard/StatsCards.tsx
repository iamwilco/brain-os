import { Database, FileText, FolderKanban, Bot, Loader2 } from "lucide-react"
import { useStats } from "@/hooks/useStats"

interface StatCardProps {
  title: string
  value: number | undefined
  icon: React.ReactNode
  loading?: boolean
}

function StatCard({ title, value, icon, loading }: StatCardProps) {
  return (
    <div className="p-6 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-sm text-muted-foreground">{title}</h3>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <p className="text-3xl font-bold">{value?.toLocaleString() ?? '-'}</p>
      )}
    </div>
  )
}

export function StatsCards() {
  const { data: stats, isLoading, error } = useStats()

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
        Failed to load stats. Make sure the backend is running on port 3001.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Sources"
        value={stats?.sources}
        icon={<Database className="h-5 w-5" />}
        loading={isLoading}
      />
      <StatCard
        title="Items"
        value={stats?.items}
        icon={<FileText className="h-5 w-5" />}
        loading={isLoading}
      />
      <StatCard
        title="Projects"
        value={stats?.projects}
        icon={<FolderKanban className="h-5 w-5" />}
        loading={isLoading}
      />
      <StatCard
        title="Agents"
        value={stats?.agents}
        icon={<Bot className="h-5 w-5" />}
        loading={isLoading}
      />
    </div>
  )
}
