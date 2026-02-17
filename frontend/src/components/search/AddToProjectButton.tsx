import { useState } from "react"
import { FolderPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { AddToProjectModal, type Project } from "./AddToProjectModal"

interface AddToProjectButtonProps {
  itemId: string
  itemTitle: string
  projects: Project[]
  isLoadingProjects?: boolean
  onAddToProject: (itemId: string, projectId: string) => Promise<void>
  onCreateProject?: () => void
  variant?: 'icon' | 'button'
  className?: string
}

export function AddToProjectButton({
  itemId,
  itemTitle,
  projects,
  isLoadingProjects,
  onAddToProject,
  onCreateProject,
  variant = 'icon',
  className,
}: AddToProjectButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleAddToProject = async (projectId: string) => {
    await onAddToProject(itemId, projectId)
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={() => setIsModalOpen(true)}
          className={cn(
            "p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            className
          )}
          title="Add to project"
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={() => setIsModalOpen(true)}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md",
            "border border-border hover:bg-accent",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            className
          )}
        >
          <FolderPlus className="h-4 w-4" />
          Add to Project
        </button>
      )}

      <AddToProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        projects={projects}
        isLoading={isLoadingProjects}
        onAddToProject={handleAddToProject}
        onCreateProject={onCreateProject}
        itemTitle={itemTitle}
      />
    </>
  )
}
