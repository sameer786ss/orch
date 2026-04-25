import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { OpenFile } from '../types'
import type * as Monaco from 'monaco-editor'

interface EditorStore {
  openFiles: OpenFile[]
  activeFilePath: string | null
  editorInstance: Monaco.editor.IStandaloneCodeEditor | null

  setEditorInstance: (e: Monaco.editor.IStandaloneCodeEditor) => void
  openFile: (filePath: string, language: string) => void
  closeFile: (filePath: string) => void
  setActiveFile: (filePath: string) => void
  markDirty: (filePath: string, dirty: boolean) => void
}

export const useEditorStore = create<EditorStore>()(
  immer(set => ({
    openFiles: [],
    activeFilePath: null,
    editorInstance: null,

    setEditorInstance: (e) => set(s => { s.editorInstance = e as any }),

    openFile: (filePath, language) => {
      set(s => {
        const exists = s.openFiles.find(f => f.path === filePath)
        if (!exists) {
          s.openFiles.push({ path: filePath, language, isDirty: false })
        }
        s.activeFilePath = filePath
      })
    },

    closeFile: (filePath) => {
      set(s => {
        const idx = s.openFiles.findIndex(f => f.path === filePath)
        if (idx === -1) return
        s.openFiles.splice(idx, 1)
        if (s.activeFilePath === filePath) {
          s.activeFilePath = s.openFiles[Math.min(idx, s.openFiles.length - 1)]?.path ?? null
        }
      })
    },

    setActiveFile: (filePath) => set(s => { s.activeFilePath = filePath }),

    markDirty: (filePath, dirty) => {
      set(s => {
        const f = s.openFiles.find(f => f.path === filePath)
        if (f) f.isDirty = dirty
      })
    },
  }))
)
