import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface UIStore {
  leftSidebarOpen: boolean
  editorPanelOpen: boolean
  fileExplorerOpen: boolean
  indexingProgress: { indexed: number; total: number; file: string } | null

  toggleLeftSidebar: () => void
  toggleEditorPanel: () => void
  toggleFileExplorer: () => void
  setIndexingProgress: (p: { indexed: number; total: number; file: string } | null) => void
}

export const useUIStore = create<UIStore>()(
  immer(set => ({
    leftSidebarOpen: true,
    editorPanelOpen: true,
    fileExplorerOpen: true,
    indexingProgress: null,

    toggleLeftSidebar: () => set(s => { s.leftSidebarOpen = !s.leftSidebarOpen }),
    toggleEditorPanel: () => set(s => { s.editorPanelOpen = !s.editorPanelOpen }),
    toggleFileExplorer: () => set(s => { s.fileExplorerOpen = !s.fileExplorerOpen }),
    setIndexingProgress: (p) => set(s => { s.indexingProgress = p }),
  }))
)
