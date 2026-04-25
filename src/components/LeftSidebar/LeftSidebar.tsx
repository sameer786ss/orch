import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react'
import { useConversationStore } from '../../stores/useConversationStore'
import type { Conversation } from '../../types'

export const LeftSidebar: React.FC<{ open: boolean }> = ({ open }) => {
  const { conversations, activeConversationId, setActive } = useConversationStore()
  const convList = Object.values(conversations).sort((a, b) => b.updatedAt - a.updatedAt)

  const running = convList.filter(c => c.status === 'running')
  const errored = convList.filter(c => c.status === 'error')
  const done    = convList.filter(c => c.status === 'done' || c.status === 'idle')

  return (
    <div className={`left-sidebar ${open ? '' : 'collapsed'}`}>
      <div style={{ overflowY: 'auto', flex: 1 }}>

        {running.length > 0 && (
          <>
            <div className="sidebar-section-title">In Progress ({running.length})</div>
            {running.map(c => (
              <ConvItem key={c.id} conv={c} active={c.id === activeConversationId} onClick={() => setActive(c.id)} />
            ))}
          </>
        )}

        {errored.length > 0 && (
          <>
            <div className="sidebar-section-title">Errors ({errored.length})</div>
            {errored.map(c => (
              <ConvItem key={c.id} conv={c} active={c.id === activeConversationId} onClick={() => setActive(c.id)} />
            ))}
          </>
        )}

        {done.length > 0 && (
          <>
            <div className="sidebar-section-title">Conversations ({done.length})</div>
            {done.map(c => (
              <ConvItem key={c.id} conv={c} active={c.id === activeConversationId} onClick={() => setActive(c.id)} />
            ))}
          </>
        )}

        {convList.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No conversations yet.<br />Start a new agent.
          </div>
        )}
      </div>
    </div>
  )
}

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'running') return <Loader2      size={13} className="spinning"    style={{ color: 'var(--accent)' }} />
  if (status === 'done')    return <CheckCircle2 size={13}                         style={{ color: 'var(--success)' }} />
  if (status === 'error')   return <AlertCircle  size={13}                         style={{ color: 'var(--danger)' }} />
  return                           <MessageSquare size={13}                         style={{ color: 'var(--text-muted)' }} />
}

const ConvItem: React.FC<{ conv: Conversation; active: boolean; onClick: () => void }> = ({ conv, active, onClick }) => {
  const lastMsg = conv.messages[conv.messages.length - 1]
  const sub     = lastMsg?.content?.slice(0, 60) ?? 'No messages yet'

  return (
    <div className={`sidebar-item ${active ? 'active' : ''} ${conv.status === 'error' ? 'error' : ''}`} onClick={onClick}>
      <div className="sidebar-item-icon">
        <StatusIcon status={conv.status} />
      </div>
      <div className="sidebar-item-body">
        <div className="sidebar-item-title">{conv.title}</div>
        <div className="sidebar-item-sub">{sub}</div>
      </div>
      <div className="sidebar-item-time">
        {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: false }).replace('about ', '')}
      </div>
    </div>
  )
}
