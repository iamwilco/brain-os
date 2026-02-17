import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "@/components/layout"
import { DashboardPage } from "@/pages/DashboardPage"
import { SourcesPage } from "@/pages/SourcesPage"
import { SourceDetailPage } from "@/pages/SourceDetailPage"
import { ProjectsPage } from "@/pages/ProjectsPage"
import { ProjectDetailPage } from "@/pages/ProjectDetailPage"
import { AgentsPage } from "@/pages/AgentsPage"
import { AgentDetailPage } from "@/pages/AgentDetailPage"
import { AutonomyPage } from "@/pages/AutonomyPage"
import { SearchPage } from "@/components/search/SearchPage"
import { SettingsPage } from "@/components/settings/SettingsPage"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "sources",
        element: <SourcesPage />,
      },
      {
        path: "sources/:id",
        element: <SourceDetailPage />,
      },
      {
        path: "search",
        element: <SearchPage />,
      },
      {
        path: "projects",
        element: <ProjectsPage />,
      },
      {
        path: "projects/:id",
        element: <ProjectDetailPage />,
      },
      {
        path: "agents",
        element: <AgentsPage />,
      },
      {
        path: "agents/:id",
        element: <AgentDetailPage />,
      },
      {
        path: "autonomy",
        element: <AutonomyPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
])
