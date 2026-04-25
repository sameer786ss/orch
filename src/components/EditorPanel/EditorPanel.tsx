import React from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { FolderOpen } from 'lucide-react'
import { useFileSystemStore } from '../../stores/useFileSystemStore'
import { MonacoEditor } from './MonacoEditor'
import { EditorTabs } from './EditorTabs'
import { FileExplorer } from '../FileExplorer/FileExplorer'
import { useEditorStore } from '../../stores/useEditorStore'
import { useUIStore } from '../../stores/useUIStore'

export const EditorPanel: React.FC<{ width?: number | string }> = () => {
  const { workspacePath, openFolder } = useFileSystemStore()
  const { openFiles } = useEditorStore()
  const { fileExplorerOpen } = useUIStore()

  return (
    <div className="editor-panel" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tabs bar — spans full width */}
      <EditorTabs />

      {/* Monaco + Explorer — horizontal split, explorer on RIGHT */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <PanelGroup direction="horizontal" autoSaveId="orch-editor-layout">
          {/* Monaco editor — main area */}
          <Panel id="monaco" order={1} defaultSize={fileExplorerOpen ? 72 : 100} minSize={40}>
            <div className="editor-main" style={{ height: '100%' }}>
              {workspacePath && openFiles.length > 0 ? (
                <MonacoEditor />
              ) : workspacePath ? (
                <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <FolderOpen size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                    <div style={{ fontSize: 14 }}>Select a file from the explorer</div>
                  </div>
                </div>
              ) : (
                <div className="open-folder-screen">
                  <FolderOpen size={48} style={{ opacity: 0.3 }} />
                  <div style={{ fontSize: 15, fontWeight: 500 }}>No folder open</div>
                  <div style={{ fontSize: 12 }}>Open a folder to start coding</div>
                  <button className="open-folder-btn" onClick={openFolder}>
                    <FolderOpen size={16} />
                    Open Folder
                  </button>
                </div>
              )}
            </div>
          </Panel>

          {/* File Explorer — right sub-panel */}
          {fileExplorerOpen && (
            <>
              <PanelResizeHandle className="panel-resizer-handle panel-resizer-handle--vertical" />
              <Panel id="explorer" order={2} defaultSize={28} minSize={16} maxSize={50}>
                <FileExplorer />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  )
}
