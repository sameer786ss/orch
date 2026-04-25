import React from 'react'
import { X, PanelRight } from 'lucide-react'
import { useEditorStore } from '../../stores/useEditorStore'
import { useUIStore } from '../../stores/useUIStore'

// Maps file extension to Monaco language id
export function extToLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',  tsx: 'typescript',  js: 'javascript', jsx: 'javascript',
    py: 'python',      rs: 'rust',         go: 'go',         java: 'java',
    c:  'c',           cpp: 'cpp',         cs: 'csharp',     rb: 'ruby',
    php: 'php',        swift: 'swift',     kt: 'kotlin',
    vue: 'html',       svelte: 'html',     html: 'html',
    css: 'css',        scss: 'scss',       less: 'less',
    json: 'json',      yaml: 'yaml',       yml: 'yaml',      toml: 'toml',
    md: 'markdown',    mdx: 'markdown',    sh: 'shell',       bash: 'shell',
    txt: 'plaintext',
  }
  return map[ext] ?? 'plaintext'
}

export const EditorTabs: React.FC = () => {
  const { openFiles, activeFilePath, closeFile, setActiveFile } = useEditorStore()
  const { fileExplorerOpen, toggleFileExplorer } = useUIStore()

  return (
    <div className="editor-tabs-bar">
      <div className="editor-header-actions">
        <button
          className={`editor-icon-btn ${fileExplorerOpen ? 'active' : ''}`}
          onClick={toggleFileExplorer}
          title="Toggle Explorer"
        >
          <PanelRight size={14} />
        </button>
      </div>
      <div className="editor-tabs-scroll">
        {openFiles.map(file => {
          const name     = file.path.split('/').pop() ?? file.path
          const isActive = file.path === activeFilePath
          return (
            <div
              key={file.path}
              className={`editor-tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveFile(file.path)}
              title={file.path}
            >
              {file.isDirty && <span className="editor-tab-dot" />}
              <span style={{ fontSize: 12 }}>{name}</span>
              <button
                className="editor-tab-close"
                onClick={e => { e.stopPropagation(); closeFile(file.path) }}
                title="Close tab"
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
