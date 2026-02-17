import { useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { RightPanel } from "./RightPanel"

interface AppLayoutProps {
  children?: React.ReactNode
  rightPanelContent?: React.ReactNode
  rightPanelTitle?: string
}

export function AppLayout({ 
  children, 
  rightPanelContent,
  rightPanelTitle 
}: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [rightPanelOpen, setRightPanelOpen] = useState(false)

  const handleNavigate = (path: string) => {
    navigate(path)
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Left Sidebar */}
      <Sidebar 
        currentPath={location.pathname} 
        onNavigate={handleNavigate} 
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold">
            {getPageTitle(location.pathname)}
          </h1>
          <div className="flex items-center gap-2">
            {/* Header actions can go here */}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6">
          {children || <Outlet />}
        </div>
      </main>

      {/* Right Panel */}
      <RightPanel
        open={rightPanelOpen}
        onToggle={() => setRightPanelOpen(!rightPanelOpen)}
        title={rightPanelTitle}
      >
        {rightPanelContent}
      </RightPanel>
    </div>
  )
}

function getPageTitle(path: string): string {
  const titles: Record<string, string> = {
    "/": "Dashboard",
    "/projects": "Projects",
    "/agents": "Agents",
    "/search": "Search",
    "/sources": "Sources",
    "/settings": "Settings",
  }
  return titles[path] || "Wilco OS"
}
