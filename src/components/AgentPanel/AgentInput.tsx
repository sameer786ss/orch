import React, { useRef, useCallback, useEffect } from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import { Image, Mic, Bot, Monitor, Send, Globe } from 'lucide-react'
import { useConversationStore } from '../../stores/useConversationStore'
import { useFileSystemStore } from '../../stores/useFileSystemStore'
import { nanoid } from 'nanoid'
import { getPathBaseName } from '../../utils/path'

interface AgentInputProps {
  conversationId: string
  disabled?:      boolean
  centered?:      boolean
}

export const AgentInput: React.FC<AgentInputProps> = ({ conversationId, disabled, centered }) => {
  const textRef      = useRef<HTMLTextAreaElement>(null)
  const cleanupRef   = useRef<(() => void) | null>(null)

  const addMessage                = useConversationStore(s => s.addMessage)
  const appendToLastAssistantMessage = useConversationStore(s => s.appendToLastAssistantMessage)
  const addToolCall               = useConversationStore(s => s.addToolCall)
  const resolveToolCall           = useConversationStore(s => s.resolveToolCall)
  const finalizeStreaming         = useConversationStore(s => s.finalizeStreaming)
  const setStatus                 = useConversationStore(s => s.setStatus)
  const setTitle                  = useConversationStore(s => s.setTitle)
  const workspacePath             = useFileSystemStore(s => s.workspacePath)

  // Cleanup any lingering listeners on unmount
  useEffect(() => {
    return () => { cleanupRef.current?.() }
  }, [])

  const handleSend = useCallback(async () => {
    const text = textRef.current?.value.trim()
    if (!text || disabled) return
    if (textRef.current) textRef.current.value = ''

    // Cleanup any previous pending listeners before registering new ones
    cleanupRef.current?.()
    cleanupRef.current = null

    // Auto-title from first message
    const conv = useConversationStore.getState().conversations[conversationId]
    if (conv && conv.messages.length === 0) {
      setTitle(conversationId, text.slice(0, 40))
    }

    const userMsg: Parameters<typeof addMessage>[1] = {
      id: nanoid(), role: 'user', type: 'text',
      content: text, timestamp: Date.now(),
    }
    addMessage(conversationId, userMsg)
    setStatus(conversationId, 'running')

    // Build messages array for AI
    const updatedConv = useConversationStore.getState().conversations[conversationId]
    const messages = updatedConv.messages
      .filter(m => m.type === 'text' && (m.role === 'user' || m.role === 'assistant') && !m.streaming)
      .map(m => ({ role: m.role, content: m.content }))

    // Track tool call message IDs by toolCallId for stable correlation.
    const toolMsgIds = new Map<string, string>()

    // ── Register one-shot listeners (using named fns for cleanup) ──
    const unsubChunk = window.orch.onTextChunk(({ conversationId: cid, text: chunk, isThought }) => {
      if (cid !== conversationId) return
      appendToLastAssistantMessage(cid, chunk, isThought)
    })

    const unsubTool = window.orch.onToolCall(({ conversationId: cid, toolCallId, name, args }) => {
      if (cid !== conversationId) return
      const msgId = addToolCall(cid, name, args)
      toolMsgIds.set(toolCallId, msgId)
    })

    const unsubResult = window.orch.onToolResult(({ conversationId: cid, toolCallId, result }) => {
      if (cid !== conversationId) return
      const msgId = toolMsgIds.get(toolCallId)
      if (msgId) resolveToolCall(cid, msgId, result)
    })

    const cleanup = () => {
      unsubChunk()
      unsubTool()
      unsubResult()
      unsubDone()
      unsubError()
      cleanupRef.current = null
    }

    const unsubDone = window.orch.onAiDone(({ conversationId: cid }) => {
      if (cid !== conversationId) return
      finalizeStreaming(cid, 'done')
      cleanup()
    })

    const unsubError = window.orch.onAiError(({ conversationId: cid, error }) => {
      if (cid !== conversationId) return
      addMessage(cid, {
        id: nanoid(), role: 'assistant', type: 'text',
        content: `⚠️ Error: ${error}`, timestamp: Date.now(),
      })
      setStatus(cid, 'error')
      finalizeStreaming(cid, 'error')
      cleanup()
    })

    cleanupRef.current = cleanup

    window.orch.startChat(conversationId, messages, workspacePath)
  }, [
    conversationId, disabled, workspacePath,
    addMessage, appendToLastAssistantMessage, addToolCall,
    resolveToolCall, finalizeStreaming, setStatus, setTitle,
  ])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="agent-input-wrapper">
      <div className="agent-input-card">
        <TextareaAutosize
          ref={textRef}
          className="agent-input-textarea"
          placeholder="Plan, build, debug — or just ask anything…"
          minRows={centered ? 3 : 1}
          maxRows={12}
          onKeyDown={handleKey}
          disabled={disabled}
        />
        <div className="agent-input-footer">
          <div className="agent-input-footer-left">
          <div className="agent-pill">
              <Bot size={11} className="icon" />
              Kimi-K2
            </div>
            <div className="agent-pill">
              <Globe size={11} className="icon" />
              Web Search
            </div>
          </div>
          <div className="agent-input-actions">
            <button className="agent-icon-btn" title="Attach image (coming soon)" disabled>
              <Image size={13} />
            </button>
            <button className="agent-icon-btn" title="Voice (coming soon)" disabled>
              <Mic size={13} />
            </button>
            <button
              className="agent-icon-btn agent-send-btn-visible"
              title="Send (Enter)"
              onClick={handleSend}
              disabled={disabled}
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>
      <div className="workspace-selector">
        <Monitor size={11} />
        <span>{workspacePath ? getPathBaseName(workspacePath) : 'Local'}</span>
      </div>
    </div>
  )
}
