import { useState } from "react"
import { Button } from "@/components/ui/button"

interface ScheduledRun {
  id: string
  agentId: string
  agentName: string
  cron: string
  nextRun: string
  lastRun?: string
  enabled: boolean
}

interface TriggerEvent {
  id: string
  type: string
  agentName: string
  timestamp: string
  source: string
  success: boolean
  error?: string
}

interface AgentHealth {
  id: string
  name: string
  status: "healthy" | "degraded" | "error"
  lastActivity: string
  errorCount: number
  successRate: number
}

interface ErrorLog {
  id: string
  timestamp: string
  agentName: string
  operation: string
  message: string
  attempt: number
  escalated: boolean
}

const mockScheduledRuns: ScheduledRun[] = [
  { id: "1", agentId: "admin", agentName: "Wilco (Admin)", cron: "0 9 * * *", nextRun: "2026-02-09T09:00:00Z", lastRun: "2026-02-08T09:00:00Z", enabled: true },
  { id: "2", agentId: "admin", agentName: "Wilco (Admin)", cron: "0 0 * * 1", nextRun: "2026-02-10T00:00:00Z", lastRun: "2026-02-03T00:00:00Z", enabled: true },
  { id: "3", agentId: "project-brain", agentName: "Brain Project", cron: "*/15 * * * *", nextRun: "2026-02-08T17:45:00Z", lastRun: "2026-02-08T17:30:00Z", enabled: false },
]

const mockTriggerEvents: TriggerEvent[] = [
  { id: "1", type: "extraction:complete", agentName: "Wilco (Admin)", timestamp: "2026-02-08T16:30:00Z", source: "chatgpt-export", success: true },
  { id: "2", type: "file:created", agentName: "Brain Project", timestamp: "2026-02-08T15:45:00Z", source: "/30_Projects/Brain/notes.md", success: true },
  { id: "3", type: "memory:updated", agentName: "Wilco (Admin)", timestamp: "2026-02-08T14:20:00Z", source: "MEMORY.md", success: false, error: "Write failed" },
]

const mockAgentHealth: AgentHealth[] = [
  { id: "admin", name: "Wilco (Admin)", status: "healthy", lastActivity: "2026-02-08T17:30:00Z", errorCount: 0, successRate: 100 },
  { id: "project-brain", name: "Brain Project", status: "degraded", lastActivity: "2026-02-08T16:00:00Z", errorCount: 2, successRate: 85 },
  { id: "skill-seo", name: "SEO Analyzer", status: "healthy", lastActivity: "2026-02-08T12:00:00Z", errorCount: 0, successRate: 98 },
]

const mockErrorLogs: ErrorLog[] = [
  { id: "1", timestamp: "2026-02-08T14:20:00Z", agentName: "Wilco (Admin)", operation: "memory:write", message: "Write failed: disk full", attempt: 3, escalated: true },
  { id: "2", timestamp: "2026-02-08T12:15:00Z", agentName: "Brain Project", operation: "llm:call", message: "Rate limit exceeded", attempt: 2, escalated: false },
  { id: "3", timestamp: "2026-02-08T10:30:00Z", agentName: "Brain Project", operation: "file:read", message: "File not found", attempt: 1, escalated: false },
]

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function formatCron(cron: string): string {
  const parts = cron.split(" ")
  if (parts[0] === "0" && parts[1] !== "*") return `Daily at ${parts[1]}:00`
  if (parts[4] === "1") return "Weekly on Monday"
  if (parts[0].startsWith("*/")) return `Every ${parts[0].slice(2)} minutes`
  return cron
}

function StatCard({ title, value, subtitle }: { title: string; value: string | number; subtitle: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  )
}

function ScheduledRunsTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Scheduled Runs</h3>
        <Button variant="outline" size="sm">Refresh</Button>
      </div>
      <div className="space-y-3">
        {mockScheduledRuns.map((run) => (
          <div key={run.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{run.agentName}</p>
                <p className="text-sm text-muted-foreground">{formatCron(run.cron)}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm">
                  <p>Next: {formatDate(run.nextRun)}</p>
                  {run.lastRun && <p className="text-muted-foreground">Last: {formatDate(run.lastRun)}</p>}
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${run.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                  {run.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TriggersTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Trigger History</h3>
        <Button variant="outline" size="sm">Refresh</Button>
      </div>
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {mockTriggerEvents.map((event) => (
          <div key={event.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{event.type}</p>
                  <span className="px-2 py-0.5 text-xs rounded bg-muted">{event.agentName}</span>
                </div>
                <p className="text-sm text-muted-foreground">{event.source}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{formatDate(event.timestamp)}</span>
                <span className={`w-3 h-3 rounded-full ${event.success ? "bg-green-500" : "bg-red-500"}`} />
              </div>
            </div>
            {event.error && <p className="mt-2 text-sm text-red-500">{event.error}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function HealthTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Agent Health</h3>
        <Button variant="outline" size="sm">Refresh</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockAgentHealth.map((agent) => (
          <div key={agent.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium">{agent.name}</p>
              <span className={`px-2 py-1 text-xs rounded-full ${
                agent.status === "healthy" ? "bg-green-100 text-green-800" :
                agent.status === "degraded" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"
              }`}>
                {agent.status}
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Success Rate</span>
                <span className="font-medium">{agent.successRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Errors (24h)</span>
                <span className="font-medium">{agent.errorCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Activity</span>
                <span className="font-medium text-xs">{formatDate(agent.lastActivity)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorsTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Error Log</h3>
        <Button variant="outline" size="sm">Refresh</Button>
      </div>
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {mockErrorLogs.map((log) => (
          <div key={log.id} className={`rounded-lg border p-4 ${log.escalated ? "border-red-500" : ""}`}>
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium">{log.operation}</p>
              <span className="px-2 py-0.5 text-xs rounded bg-muted">{log.agentName}</span>
              {log.escalated && <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">Escalated</span>}
            </div>
            <p className="text-sm">{log.message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Attempt {log.attempt} • {formatDate(log.timestamp)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AutonomyPage() {
  const [activeTab, setActiveTab] = useState("schedules")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Autonomy Dashboard</h1>
        <p className="text-muted-foreground">Monitor scheduled runs, triggered behaviors, and agent health</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Scheduled Runs" value={mockScheduledRuns.filter(r => r.enabled).length} subtitle="Active schedules" />
        <StatCard title="Triggers Today" value={mockTriggerEvents.length} subtitle="Events fired" />
        <StatCard title="Agent Health" value={`${mockAgentHealth.filter(a => a.status === "healthy").length}/${mockAgentHealth.length}`} subtitle="Healthy agents" />
        <StatCard title="Errors (24h)" value={mockErrorLogs.length} subtitle={`${mockErrorLogs.filter(e => e.escalated).length} escalated`} />
      </div>

      <div className="space-y-4">
        <div className="flex gap-2 border-b pb-2">
          <TabButton active={activeTab === "schedules"} onClick={() => setActiveTab("schedules")}>Schedules</TabButton>
          <TabButton active={activeTab === "triggers"} onClick={() => setActiveTab("triggers")}>Triggers</TabButton>
          <TabButton active={activeTab === "health"} onClick={() => setActiveTab("health")}>Health</TabButton>
          <TabButton active={activeTab === "errors"} onClick={() => setActiveTab("errors")}>Errors</TabButton>
        </div>
        
        {activeTab === "schedules" && <ScheduledRunsTab />}
        {activeTab === "triggers" && <TriggersTab />}
        {activeTab === "health" && <HealthTab />}
        {activeTab === "errors" && <ErrorsTab />}
      </div>
    </div>
  )
}
