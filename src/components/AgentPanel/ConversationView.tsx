import React, { useEffect, useRef } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { MessageBubble } from './MessageBubble'
import { AgentInput } from './AgentInput'
import type { Message } from '../../types'
import { useConversationStore } from '../../stores/useConversationStore'

interface ConversationViewProps {
  conversationId: string
}

export const ConversationView: React.FC<ConversationViewProps> = ({ conversationId }) => {
  const messages    = useConversationStore(s => s.conversations[conversationId]?.messages ?? [])
  const status      = useConversationStore(s => s.conversations[conversationId]?.status ?? 'idle')
  const loadMessages = useConversationStore(s => s.loadMessages)
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Lazy-load messages from DB the first time this conversation is shown
  useEffect(() => {
    if (messages.length === 0) {
      loadMessages(conversationId)
    }
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="conversation-view">
      <div className="message-list-container" style={{ display: messages.length === 0 ? 'none' : 'block' }}>
        {messages.length > 0 && (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            followOutput="smooth"
            computeItemKey={(_, message: Message) => message.id}
            itemContent={(_index: number, message: Message) => (
              <MessageBubble message={message} />
            )}
            style={{ height: '100%' }}
            increaseViewportBy={400}
          />
        )}
      </div>
      <div className={messages.length === 0 ? "agent-empty" : "agent-bottom-input"}>
        <AgentInput
          conversationId={conversationId}
          disabled={status === 'running'}
          centered={messages.length === 0}
        />
      </div>
    </div>
  )
}
