import React from 'react'

import { ConversationView } from './ConversationView'
import { useConversationStore } from '../../stores/useConversationStore'

export const AgentPanel: React.FC = () => {
  const { conversations, activeConversationId, createConversation } = useConversationStore()
  const activeConv = activeConversationId ? conversations[activeConversationId] : null

  if (!activeConv) {
    return (
      <div className="agent-panel">
        <div className="agent-empty">
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
            <div style={{ fontSize: 14, marginBottom: 20, color: 'var(--text-secondary)' }}>
              Start a new agent session
            </div>
            <button
              className="open-folder-btn"
              onClick={createConversation}
            >
              New Agent
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="agent-panel">
      <ConversationView key={activeConv.id} conversationId={activeConv.id} />
    </div>
  )
}
