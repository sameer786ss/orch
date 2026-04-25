import React, { useEffect } from 'react'
import { PanelRightClose, PanelRightOpen, FolderOpen } from 'lucide-react'
import { FileTreeNode } from './FileTreeNode'
import { useFileSystemStore } from '../../stores/useFileSystemStore'
import { useEditorStore } from '../../stores/useEditorStore'
import { useUIStore } from '../../stores/useUIStore'
import { invalidateModelCache } from '../EditorPanel/MonacoEditor'

export const FileExplorer: React.FC = () => {
  const { workspacePath, fileTree, openFolder, handleWatcherEvent } = useFileSystemStore()
  const { activeFilePath, closeFile } = useEditorStore()

  // Single useUIStore call — merged into one subscription
  const { fileExplorerOpen, toggleFileExplorer, indexingProgress, setIndexingProgress } = useUIStore()

  // Subscribe to watcher events & indexing progress via IPC
  useEffect(() => {
    const unsubWatch = window.orch.onWatcherEvent(e => {
      handleWatcherEvent(e)
      // When a file is deleted, close its tab and invalidate its Monaco model
      if (e.type === 'unlink') {
        invalidateModelCache(e.path)
        closeFile(e.path)
      }
    })

    const unsubIndex = window.orch.onIndexProgress(d => {
      setIndexingProgress(d)
      if (d.indexed >= d.total) {
        setTimeout(() => setIndexingProgress(null), 2000)
      }
    })

    return () => {
      unsubWatch()
      unsubIndex()
    }
  }, [handleWatcherEvent, setIndexingProgress, closeFile])

  return (
    <div className={`file-explorer ${fileExplorerOpen ? '' : 'collapsed'}`}>
      <div className="explorer-header">
        <span className="explorer-title">
          {workspacePath ? workspacePath.split('/').pop() : 'Explorer'}
        </span>
        <button className="explorer-toggle-btn" onClick={toggleFileExplorer} title="Toggle explorer">
          {fileExplorerOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>
      </div>

      {workspacePath && fileTree ? (
        <>
          <div className="explorer-tree">
            {fileTree.children?.map(node => (
              <FileTreeNode
                key={node.path}
                node={node}
                depth={0}
                activeFilePath={activeFilePath}
              />
            ))}
          </div>
          {indexingProgress && (
            <div className="indexing-bar">
              <span>Indexing {indexingProgress.file.split('/').pop()}…</span>
              <div className="indexing-progress">
                <div
                  className="indexing-fill"
                  style={{
                    width: `${Math.round((indexingProgress.indexed / indexingProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="explorer-open-folder">
          <FolderOpen size={32} style={{ opacity: 0.3 }} />
          <div style={{ fontSize: 12 }}>No folder open</div>
          <button className="explorer-open-btn" onClick={openFolder}>
            Open Folder
          </button>
        </div>
      )}
    </div>
  )
}
