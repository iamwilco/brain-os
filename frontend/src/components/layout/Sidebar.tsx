import { cn } from "@/lib/utils"
import { 
  Home, 
  FolderKanban, 
  Bot, 
  Search, 
  Database, 
  Settings,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { useState } from "react"

interface NavItem {
  icon: React.ElementType
  label: string
  href: string
  active?: boolean
}

const navItems: NavItem[] = [
  { icon: Home, label: "Dashboard", href: "/" },
  { icon: FolderKanban, label: "Projects", href: "/projects" },
  { icon: Bot, label: "Agents", href: "/agents" },
  { icon: Search, label: "Search", href: "/search" },
  { icon: Database, label: "Sources", href: "/sources" },
  { icon: Settings, label: "Settings", href: "/settings" },
]

interface SidebarProps {
  currentPath?: string
  onNavigate?: (path: string) => void
}

export function Sidebar({ currentPath = "/", onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r border-border transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-border">
        {!collapsed && (
          <span className="font-semibold text-lg">Wilco OS</span>
        )}
        {collapsed && (
          <span className="font-semibold text-lg">W</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = currentPath === item.href
            return (
              <li key={item.href}>
                <button
                  onClick={() => onNavigate?.(item.href)}
                  className={cn(
                    "flex items-center w-full px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && (
                    <span className="ml-3">{item.label}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>
    </aside>
  )
}
