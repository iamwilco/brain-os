import type { SkillInvocation } from "../../hooks/useSkillInvocation"

const statusColors = {
  idle: 'bg-muted',
  starting: 'bg-blue-500',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  error: 'bg-red-500',
}

export function SkillProgress({ invocation }: { invocation: SkillInvocation }) {
  return (
    <div className="space-y-2 p-3 rounded-lg border border-border">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{invocation.skillName}</span>
        <span className="text-xs text-muted-foreground capitalize">{invocation.status}</span>
      </div>
      
      <p className="text-xs text-muted-foreground truncate">{invocation.task}</p>
      
      {(invocation.status === 'starting' || invocation.status === 'running') && (
        <>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${statusColors[invocation.status]}`}
              style={{ width: `${invocation.progress || 0}%` }}
            />
          </div>
          {invocation.progressMessage && (
            <p className="text-xs text-muted-foreground">{invocation.progressMessage}</p>
          )}
        </>
      )}

      {invocation.status === 'error' && invocation.error && (
        <p className="text-xs text-red-600">{invocation.error}</p>
      )}
    </div>
  )
}
