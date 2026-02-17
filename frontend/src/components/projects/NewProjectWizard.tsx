import { useState } from "react"
import { 
  X,
  FolderPlus,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Smile,
  FileText,
  Bot
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NewProjectWizardProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (config: ProjectConfig) => Promise<void>
}

export interface ProjectConfig {
  name: string
  emoji: string
  description: string
  createAgent: boolean
}

const EMOJI_OPTIONS = [
  '📁', '🚀', '💡', '🎯', '📊', '🔧', '📝', '🎨',
  '🌟', '💼', '🔬', '📚', '🎮', '🎵', '📸', '🌍',
  '⚡', '🔥', '💎', '🏆', '🎁', '🔮', '🌈', '🍀',
  '🦄', '🐱', '🐶', '🦊', '🐼', '🐸', '🦋', '🌸',
]

type WizardStep = 'basics' | 'options' | 'confirm'

const steps: { id: WizardStep; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'options', label: 'Options' },
  { id: 'confirm', label: 'Confirm' },
]

export function NewProjectWizard({
  isOpen,
  onClose,
  onCreate,
}: NewProjectWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('basics')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('📁')
  const [description, setDescription] = useState('')
  const [createAgent, setCreateAgent] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStepIndex = steps.findIndex(s => s.id === currentStep)
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1

  const canProceed = () => {
    if (currentStep === 'basics') {
      return name.trim().length > 0
    }
    return true
  }

  const handleNext = () => {
    if (isLastStep) {
      handleCreate()
    } else {
      setCurrentStep(steps[currentStepIndex + 1].id)
    }
  }

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(steps[currentStepIndex - 1].id)
    }
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Project name is required')
      return
    }

    setError(null)
    setIsCreating(true)

    try {
      await onCreate({
        name: name.trim(),
        emoji,
        description: description.trim(),
        createAgent,
      })
      
      setName('')
      setEmoji('📁')
      setDescription('')
      setCreateAgent(false)
      setCurrentStep('basics')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    if (isCreating) return
    setError(null)
    setCurrentStep('basics')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background border border-border rounded-lg shadow-lg p-6 max-w-lg w-full mx-4">
        <button
          onClick={handleClose}
          disabled={isCreating}
          className="absolute top-4 right-4 p-1 rounded hover:bg-accent disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <FolderPlus className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">New Project</h2>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
                index <= currentStepIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                {index + 1}
              </div>
              <span className={cn(
                "ml-2 text-sm",
                index === currentStepIndex ? "font-medium" : "text-muted-foreground"
              )}>
                {step.label}
              </span>
              {index < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        <div className="min-h-[200px]">
          {currentStep === 'basics' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Project Icon</label>
                <div className="relative">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md border border-border",
                      "hover:bg-accent transition-colors"
                    )}
                  >
                    <span className="text-2xl">{emoji}</span>
                    <Smile className="h-4 w-4 text-muted-foreground" />
                  </button>
                  
                  {showEmojiPicker && (
                    <div className="absolute top-full left-0 mt-2 p-3 bg-background border border-border rounded-lg shadow-lg z-10">
                      <div className="grid grid-cols-8 gap-1">
                        {EMOJI_OPTIONS.map((e) => (
                          <button
                            key={e}
                            onClick={() => {
                              setEmoji(e)
                              setShowEmojiPicker(false)
                            }}
                            className={cn(
                              "p-2 text-xl rounded hover:bg-accent",
                              emoji === e && "bg-accent"
                            )}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Project Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Website Redesign"
                  className={cn(
                    "w-full px-3 py-2 text-sm rounded-md border border-border",
                    "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this project about?"
                  rows={3}
                  className={cn(
                    "w-full px-3 py-2 text-sm rounded-md border border-border resize-none",
                    "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                />
              </div>
            </div>
          )}

          {currentStep === 'options' && (
            <div className="space-y-4">
              <label className={cn(
                "flex items-start gap-4 p-4 rounded-lg border cursor-pointer",
                createAgent ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              )}>
                <input
                  type="checkbox"
                  checked={createAgent}
                  onChange={(e) => setCreateAgent(e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Create Project Agent</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically set up an AI agent scoped to this project for task automation
                  </p>
                </div>
              </label>

              <div className="p-4 rounded-lg bg-muted/50">
                <h4 className="text-sm font-medium mb-2">Folder Structure</h4>
                <div className="text-xs text-muted-foreground font-mono space-y-1">
                  <p>30_Projects/</p>
                  <p className="ml-4">└── {emoji} {name || 'Project Name'}/</p>
                  <p className="ml-8">├── README.md</p>
                  <p className="ml-8">├── notes/</p>
                  {createAgent && <p className="ml-8">└── agent/</p>}
                </div>
              </div>
            </div>
          )}

          {currentStep === 'confirm' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-border">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{emoji}</span>
                  <div>
                    <h3 className="font-semibold">{name}</h3>
                    {description && (
                      <p className="text-sm text-muted-foreground">{description}</p>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>Creates folder at <code className="text-xs bg-muted px-1 py-0.5 rounded">30_Projects/{emoji} {name}</code></span>
                  </div>
                  {createAgent && (
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <span>Creates project agent</span>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6 pt-4 border-t border-border">
          <button
            onClick={handleBack}
            disabled={isFirstStep || isCreating}
            className={cn(
              "flex items-center gap-1 px-4 py-2 text-sm rounded-md",
              "border border-border hover:bg-accent",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          
          <button
            onClick={handleNext}
            disabled={!canProceed() || isCreating}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm rounded-md",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : isLastStep ? (
              <>
                <FolderPlus className="h-4 w-4" />
                Create Project
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
