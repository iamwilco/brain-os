import { useState } from "react"
import { 
  Wrench,
  Play,
  Search,
  Loader2,
  PenTool,
  Globe,
  FileText,
  Code,
  Sparkles,
  X
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface SkillAgent {
  id: string
  name: string
  description: string
  icon?: 'writing' | 'seo' | 'research' | 'code' | 'general'
  isAvailable?: boolean
}

interface SkillsLauncherProps {
  skills: SkillAgent[]
  isLoading?: boolean
  onInvokeSkill: (skillId: string, task: string) => Promise<void>
}

const skillIcons = {
  writing: PenTool,
  seo: Globe,
  research: FileText,
  code: Code,
  general: Sparkles,
}

function SkillCard({
  skill,
  onSelect,
}: {
  skill: SkillAgent
  onSelect: () => void
}) {
  const Icon = skillIcons[skill.icon || 'general']

  return (
    <button
      onClick={onSelect}
      disabled={!skill.isAvailable}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border border-border text-left w-full",
        "hover:bg-accent hover:border-primary/50 transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      )}
    >
      <div className="p-2 rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{skill.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
      </div>
    </button>
  )
}

function TaskInputDialog({
  skill,
  isInvoking,
  onInvoke,
  onClose,
}: {
  skill: SkillAgent
  isInvoking: boolean
  onInvoke: (task: string) => void
  onClose: () => void
}) {
  const [task, setTask] = useState('')
  const Icon = skillIcons[skill.icon || 'general']

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (task.trim()) {
      onInvoke(task.trim())
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-lg shadow-lg p-4 max-w-md w-full mx-4">
        <button
          onClick={onClose}
          disabled={isInvoking}
          className="absolute top-3 right-3 p-1 rounded hover:bg-accent disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium">{skill.name}</h3>
            <p className="text-xs text-muted-foreground">{skill.description}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium mb-2">
            What would you like this skill to do?
          </label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the task..."
            disabled={isInvoking}
            rows={3}
            className={cn(
              "w-full px-3 py-2 text-sm rounded-md border border-border resize-none",
              "bg-background focus:outline-none focus:ring-2 focus:ring-ring",
              "disabled:opacity-50"
            )}
            autoFocus
          />

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isInvoking}
              className="px-3 py-2 text-sm rounded-md hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!task.trim() || isInvoking}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm rounded-md",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isInvoking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Skill
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function SkillsLauncher({
  skills,
  isLoading,
  onInvokeSkill,
}: SkillsLauncherProps) {
  const [search, setSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<SkillAgent | null>(null)
  const [isInvoking, setIsInvoking] = useState(false)

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(search.toLowerCase()) ||
    skill.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleInvoke = async (task: string) => {
    if (!selectedSkill) return

    setIsInvoking(true)
    try {
      await onInvokeSkill(selectedSkill.id, task)
      setSelectedSkill(null)
    } finally {
      setIsInvoking(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills..."
          className={cn(
            "w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border",
            "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        />
      </div>

      {filteredSkills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Wrench className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">
            {search ? 'No skills match your search' : 'No skills available'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onSelect={() => setSelectedSkill(skill)}
            />
          ))}
        </div>
      )}

      {selectedSkill && (
        <TaskInputDialog
          skill={selectedSkill}
          isInvoking={isInvoking}
          onInvoke={handleInvoke}
          onClose={() => !isInvoking && setSelectedSkill(null)}
        />
      )}
    </div>
  )
}
