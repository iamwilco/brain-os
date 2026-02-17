import { useNavigate } from "react-router-dom"
import { StatsCards } from "@/components/dashboard/StatsCards"
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline"
import { AgentStatusGrid } from "@/components/dashboard/AgentStatusGrid"
import { QuickActions } from "@/components/dashboard/QuickActions"

export function DashboardPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <StatsCards />
      <QuickActions 
        onImportSource={() => navigate("/sources")}
        onNewProject={() => navigate("/projects")}
        onSearch={() => navigate("/search")}
        onRunExtraction={() => navigate("/sources")}
      />
      <AgentStatusGrid onAgentClick={() => navigate("/agents")} />
      <ActivityTimeline onItemClick={(item) => {
        if (item.agentId) {
          navigate(`/agents/${item.agentId}`)
        }
      }} />
    </div>
  )
}
