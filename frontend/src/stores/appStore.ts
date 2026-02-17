import { create } from 'zustand'

interface AppState {
  currentPath: string
  rightPanelOpen: boolean
  rightPanelContent: 'details' | 'activity' | 'help' | null
  selectedItemId: string | null
  
  // Actions
  navigate: (path: string) => void
  toggleRightPanel: () => void
  setRightPanelContent: (content: 'details' | 'activity' | 'help' | null) => void
  selectItem: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPath: '/',
  rightPanelOpen: false,
  rightPanelContent: null,
  selectedItemId: null,

  navigate: (path) => set({ currentPath: path }),
  
  toggleRightPanel: () => set((state) => ({ 
    rightPanelOpen: !state.rightPanelOpen 
  })),
  
  setRightPanelContent: (content) => set({ 
    rightPanelContent: content,
    rightPanelOpen: content !== null 
  }),
  
  selectItem: (id) => set({ 
    selectedItemId: id,
    rightPanelOpen: id !== null,
    rightPanelContent: id ? 'details' : null
  }),
}))
