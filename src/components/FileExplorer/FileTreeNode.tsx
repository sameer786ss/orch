import React, { useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { FileIcon } from './FileIcon'
import { useFileSystemStore } from '../../stores/useFileSystemStore'
import { useEditorStore } from '../../stores/useEditorStore'
import { extToLanguage } from '../EditorPanel/EditorTabs'
import type { FileNode } from '../../types'

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  activeFilePath: string | null
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({ node, depth, activeFilePath }) => {
  const { expandedPaths, toggleExpand } = useFileSystemStore()
  const { openFile } = useEditorStore()
  const isExpanded = expandedPaths.has(node.path)
  const isActive = node.path === activeFilePath

  const handleClick = useCallback(async () => {
    if (node.isDir) {
      await toggleExpand(node.path)
    } else {
      openFile(node.path, extToLanguage(node.path))
    }
  }, [node, toggleExpand, openFile])

  return (
    <>
      <div
        className={`tree-node ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
        title={node.path}
      >
        {/* Arrow for dirs */}
        <span className={`tree-node-arrow ${isExpanded ? 'open' : ''}`} style={{ width: 14, display: 'flex', alignItems: 'center' }}>
          {node.isDir ? <ChevronRight size={12} /> : <span style={{ width: 12 }} />}
        </span>

        {/* Icon */}
        <span className="tree-node-icon">
          <FileIcon
            filename={node.name}
            isDir={node.isDir}
            isOpen={isExpanded}
            size={15}
          />
        </span>

        {/* Name */}
        <span className="tree-node-name">{node.name}</span>
      </div>

      {/* Recursive children */}
      {node.isDir && isExpanded && node.children?.map(child => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          activeFilePath={activeFilePath}
        />
      ))}
    </>
  )
}
