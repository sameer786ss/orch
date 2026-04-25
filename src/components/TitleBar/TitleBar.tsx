import React, { useCallback, useState } from 'react'
import {
  PanelLeft, PanelRight, Plus, RotateCcw, MoreHorizontal, MessageSquare, Settings,
} from 'lucide-react'
import { useConversationStore } from '../../stores/useConversationStore'
import { useUIStore } from '../../stores/useUIStore'
import { useFileSystemStore } from '../../stores/useFileSystemStore'

export const TitleBar: React.FC = () => {
  const { leftSidebarOpen, editorPanelOpen, toggleLeftSidebar, toggleEditorPanel } = useUIStore()
  const { conversations, activeConversationId, createConversation, deleteConversation, setActive } =
    useConversationStore()
  const { refreshTree } = useFileSystemStore()
  const [moreOpen, setMoreOpen] = useState(false)

  const convList = Object.values(conversations).sort((a, b) => b.updatedAt - a.updatedAt)
  const handleNew = useCallback(() => createConversation(), [createConversation])

  return (
    <div className="title-bar">
      <div className="title-bar-drag-space" />

      {/* Left sidebar toggle */}
      <button
        className={`title-bar-btn ${leftSidebarOpen ? 'active' : ''}`}
        onClick={toggleLeftSidebar}
        title="Toggle sidebar"
      >
        <PanelLeft size={15} />
      </button>

      {/* Agent tabs */}
      <div className="tab-bar">
        {convList.map(conv => (
          <div
            key={conv.id}
            className={`tab ${conv.id === activeConversationId ? 'active' : ''}`}
            onClick={() => setActive(conv.id)}
          >
            <MessageSquare size={12} />
            <span className="tab-title">{conv.title}</span>
            <button
              className="tab-close"
              onClick={e => { e.stopPropagation(); deleteConversation(conv.id) }}
              title="Close"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Title bar actions */}
      <div className="title-bar-actions">
        <button className="title-bar-btn" title="New Agent" onClick={handleNew}>
          <Plus size={15} />
        </button>

        {/* Refresh tree */}
        <button className="title-bar-btn" title="Refresh File Tree" onClick={refreshTree}>
          <RotateCcw size={14} />
        </button>

        {/* More menu */}
        <div style={{ position: 'relative' }}>
          <button
            className={`title-bar-btn ${moreOpen ? 'active' : ''}`}
            title="More options"
            onClick={() => setMoreOpen(v => !v)}
          >
            <MoreHorizontal size={15} />
          </button>
          {moreOpen && (
            <div className="more-menu" onClick={() => setMoreOpen(false)}>
              <button className="more-menu-item" onClick={() => window.orch.openFolder?.()}>
                <Settings size={12} />
                Open Folder…
              </button>
            </div>
          )}
        </div>

        {/* Editor panel toggle */}
        <button
          className={`title-bar-btn ${editorPanelOpen ? 'active' : ''}`}
          onClick={toggleEditorPanel}
          title="Toggle editor"
        >
          <PanelRight size={15} />
        </button>
      </div>
    </div>
  )
}
