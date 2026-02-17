import { Sun, Moon, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Theme } from "../../hooks/useTheme"

interface ThemeToggleProps {
  theme: Theme
  onThemeChange: (theme: Theme) => void
  variant?: 'icon' | 'buttons' | 'dropdown'
}

export function ThemeToggle({
  theme,
  onThemeChange,
  variant = 'buttons',
}: ThemeToggleProps) {
  if (variant === 'icon') {
    return (
      <button
        onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
        className="p-2 rounded-md hover:bg-accent"
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </button>
    )
  }

  if (variant === 'dropdown') {
    return (
      <select
        value={theme}
        onChange={(e) => onThemeChange(e.target.value as Theme)}
        className={cn(
          "px-3 py-2 rounded-md border border-border",
          "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        )}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    )
  }

  const options: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ]

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {options.map((option) => {
        const Icon = option.icon
        const isActive = theme === option.value

        return (
          <button
            key={option.value}
            onClick={() => onThemeChange(option.value)}
            title={option.label}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
              isActive 
                ? "bg-background shadow-sm" 
                : "hover:bg-background/50 text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
