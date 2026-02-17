import { useEffect, useCallback, useState } from "react"

export interface Shortcut {
  id: string
  key: string
  modifiers: ('ctrl' | 'meta' | 'alt' | 'shift')[]
  description: string
  category: 'navigation' | 'actions' | 'editing' | 'general'
  action: () => void
}

export interface ShortcutConfig {
  id: string
  key: string
  modifiers: ('ctrl' | 'meta' | 'alt' | 'shift')[]
}

const STORAGE_KEY = 'brain-keyboard-shortcuts'

const defaultShortcuts: Omit<Shortcut, 'action'>[] = [
  { id: 'search', key: 'k', modifiers: ['meta'], description: 'Open search', category: 'navigation' },
  { id: 'home', key: 'h', modifiers: ['meta', 'shift'], description: 'Go to home', category: 'navigation' },
  { id: 'projects', key: 'p', modifiers: ['meta', 'shift'], description: 'Go to projects', category: 'navigation' },
  { id: 'sources', key: 's', modifiers: ['meta', 'shift'], description: 'Go to sources', category: 'navigation' },
  { id: 'agents', key: 'a', modifiers: ['meta', 'shift'], description: 'Go to agents', category: 'navigation' },
  { id: 'settings', key: ',', modifiers: ['meta'], description: 'Open settings', category: 'navigation' },
  { id: 'help', key: '?', modifiers: ['shift'], description: 'Show shortcuts help', category: 'general' },
  { id: 'escape', key: 'Escape', modifiers: [], description: 'Close modal / Cancel', category: 'general' },
  { id: 'save', key: 's', modifiers: ['meta'], description: 'Save current item', category: 'editing' },
  { id: 'new', key: 'n', modifiers: ['meta'], description: 'Create new item', category: 'actions' },
  { id: 'delete', key: 'Backspace', modifiers: ['meta'], description: 'Delete selected', category: 'actions' },
  { id: 'refresh', key: 'r', modifiers: ['meta', 'shift'], description: 'Refresh data', category: 'actions' },
]

function loadCustomShortcuts(): ShortcutConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveCustomShortcuts(configs: ShortcutConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
}

function formatShortcut(key: string, modifiers: string[]): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const parts: string[] = []
  
  if (modifiers.includes('meta')) parts.push(isMac ? '⌘' : 'Ctrl')
  if (modifiers.includes('ctrl')) parts.push('Ctrl')
  if (modifiers.includes('alt')) parts.push(isMac ? '⌥' : 'Alt')
  if (modifiers.includes('shift')) parts.push(isMac ? '⇧' : 'Shift')
  
  const keyDisplay = key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key
  parts.push(keyDisplay)
  
  return parts.join(isMac ? '' : '+')
}

interface UseKeyboardShortcutsReturn {
  shortcuts: Shortcut[]
  customConfigs: ShortcutConfig[]
  updateShortcut: (id: string, config: Partial<ShortcutConfig>) => void
  resetShortcut: (id: string) => void
  resetAll: () => void
  formatShortcut: (key: string, modifiers: string[]) => string
}

export function useKeyboardShortcuts(
  actions: Record<string, () => void>
): UseKeyboardShortcutsReturn {
  const [customConfigs, setCustomConfigs] = useState<ShortcutConfig[]>(loadCustomShortcuts)

  const shortcuts: Shortcut[] = defaultShortcuts.map(shortcut => {
    const custom = customConfigs.find(c => c.id === shortcut.id)
    return {
      ...shortcut,
      key: custom?.key ?? shortcut.key,
      modifiers: custom?.modifiers ?? shortcut.modifiers,
      action: actions[shortcut.id] || (() => {}),
    }
  })

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target as HTMLElement)?.isContentEditable
    ) {
      if (event.key !== 'Escape') return
    }

    for (const shortcut of shortcuts) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
      const metaMatch = shortcut.modifiers.includes('meta') === (event.metaKey || event.ctrlKey)
      const altMatch = shortcut.modifiers.includes('alt') === event.altKey
      const shiftMatch = shortcut.modifiers.includes('shift') === event.shiftKey
      const ctrlMatch = !shortcut.modifiers.includes('ctrl') || event.ctrlKey

      if (keyMatch && metaMatch && altMatch && shiftMatch && ctrlMatch) {
        event.preventDefault()
        shortcut.action()
        return
      }
    }
  }, [shortcuts])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const updateShortcut = useCallback((id: string, config: Partial<ShortcutConfig>) => {
    setCustomConfigs(prev => {
      const existing = prev.find(c => c.id === id)
      const defaultShortcut = defaultShortcuts.find(s => s.id === id)
      
      if (!defaultShortcut) return prev

      const updated = existing 
        ? prev.map(c => c.id === id ? { ...c, ...config } : c)
        : [...prev, { 
            id, 
            key: config.key ?? defaultShortcut.key, 
            modifiers: config.modifiers ?? defaultShortcut.modifiers 
          }]
      
      saveCustomShortcuts(updated)
      return updated
    })
  }, [])

  const resetShortcut = useCallback((id: string) => {
    setCustomConfigs(prev => {
      const updated = prev.filter(c => c.id !== id)
      saveCustomShortcuts(updated)
      return updated
    })
  }, [])

  const resetAll = useCallback(() => {
    setCustomConfigs([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return {
    shortcuts,
    customConfigs,
    updateShortcut,
    resetShortcut,
    resetAll,
    formatShortcut,
  }
}
