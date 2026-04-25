import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileNode } from '../types'
import path from 'path' // resolved to path-browserify in renderer via vite alias

interface FileSystemStore {
  workspacePath: string | null
  fileTree:      FileNode | null
  expandedPaths: Set<string>

  openFolder:          () => Promise<void>
  setWorkspace:        (p: string) => Promise<void>
  toggleExpand:        (nodePath: string) => Promise<void>
  handleWatcherEvent:  (event: { type: string; path: string }) => void
  refreshTree:         () => Promise<void>
}

export const useFileSystemStore = create<FileSystemStore>()(
  immer((set, get) => ({
    workspacePath: null,
    fileTree:      null,
    expandedPaths: new Set(),

    openFolder: async () => {
      const p = await window.orch.openFolder()
      if (p) await get().setWorkspace(p)
    },

    setWorkspace: async (workspacePath) => {
      const tree = await window.orch.buildTree(workspacePath)
      set(s => {
        s.workspacePath = workspacePath
        s.fileTree      = tree
        s.expandedPaths = new Set([workspacePath])
      })
      await window.orch.startWatcher(workspacePath)
      await window.orch.startIndexing(workspacePath)
    },

    toggleExpand: async (nodePath) => {
      const { expandedPaths } = get()
      if (expandedPaths.has(nodePath)) {
        set(s => { s.expandedPaths.delete(nodePath) })
      } else {
        const children = await window.orch.listDir(nodePath)
        set(s => {
          s.expandedPaths.add(nodePath)
          updateTreeChildren(s.fileTree, nodePath, children)
        })
      }
    },

    handleWatcherEvent: (event) => {
      set(s => {
        if (!s.fileTree) return
        const { type, path: evPath } = event

        if (type === 'add' || type === 'addDir') {
          // Use path.dirname/basename to be platform-safe
          const parentPath = path.dirname(evPath)
          insertNode(s.fileTree, parentPath, {
            name:     path.basename(evPath),
            path:     evPath,
            isDir:    type === 'addDir',
            children: type === 'addDir' ? [] : undefined,
          })
        } else if (type === 'change') {
          // Invalidate model cache in Monaco (handled separately via subscription)
          // No tree update needed for content changes
        } else if (type === 'unlink' || type === 'unlinkDir') {
          removeNode(s.fileTree, evPath)
        }
      })
    },

    refreshTree: async () => {
      const { workspacePath } = get()
      if (!workspacePath) return
      const tree = await window.orch.buildTree(workspacePath)
      set(s => { s.fileTree = tree })
    },
  })),
)

// ── Tree helpers ─────────────────────────────────────────────────

function updateTreeChildren(node: FileNode | null, targetPath: string, children: FileNode[]) {
  if (!node) return
  if (node.path === targetPath) { node.children = children; return }
  node.children?.forEach(c => updateTreeChildren(c, targetPath, children))
}

function insertNode(node: FileNode | null, parentPath: string, newNode: FileNode) {
  if (!node) return
  if (node.path === parentPath && node.children) {
    if (!node.children.find(c => c.path === newNode.path)) {
      node.children.push(newNode)
      node.children.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1
        if (!a.isDir && b.isDir) return 1
        return a.name.localeCompare(b.name)
      })
    }
    return
  }
  node.children?.forEach(c => insertNode(c, parentPath, newNode))
}

function removeNode(node: FileNode | null, targetPath: string) {
  if (!node?.children) return
  node.children = node.children.filter(c => c.path !== targetPath)
  node.children.forEach(c => removeNode(c, targetPath))
}
