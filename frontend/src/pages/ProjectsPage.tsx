import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { FolderPlus } from "lucide-react"
import { ProjectsList, type Project } from "@/components/projects/ProjectsList"
import { NewProjectWizard, type ProjectConfig } from "@/components/projects/NewProjectWizard"
import { useProjects } from "@/hooks/useProjects"
import { projectsApi } from "@/lib/api"

export function ProjectsPage() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useProjects()
  const [wizardOpen, setWizardOpen] = useState(false)

  const projects: Project[] = (data?.data ?? []).map(p => ({
    id: p.id,
    name: p.name,
    path: `/30_Projects/${p.name}`,
    status: 'active' as const,
    description: p.description ?? undefined,
  }))

  const handleCreateProject = async (config: ProjectConfig) => {
    const project = await projectsApi.create({
      name: config.name,
      emoji: config.emoji,
      description: config.description,
      rootPath: `30_Projects/${config.name}`,
      createAgent: config.createAgent,
    })
    await refetch()
    navigate(`/projects/${project.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <FolderPlus className="h-4 w-4" />
          New Project
        </button>
      </div>

      <ProjectsList 
        projects={projects}
        isLoading={isLoading}
        onProjectClick={(project) => navigate(`/projects/${project.id}`)}
      />

      <NewProjectWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  )
}
