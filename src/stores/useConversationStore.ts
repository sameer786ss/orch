import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { nanoid } from 'nanoid'
import type { Conversation, Message, ConversationStatus } from '../types'

interface ConversationStore {
  conversations:         Record<string, Conversation>
  activeConversationId:  string | null
  hydrated:              boolean

  hydrate:                    () => Promise<void>
  loadMessages:               (id: string) => Promise<void>
  createConversation:         () => string
  deleteConversation:         (id: string) => void
  setActive:                  (id: string) => void
  setTitle:                   (id: string, title: string) => void
  setStatus:                  (id: string, status: ConversationStatus) => void
  addMessage:                 (id: string, msg: Message) => void
  appendToLastAssistantMessage:(id: string, text: string, isThought?: boolean) => void
  addToolCall:                (id: string, name: string, args: Record<string, unknown>) => string
  resolveToolCall:            (id: string, msgId: string, result: string) => void
  finalizeStreaming:          (id: string) => void
}

export const useConversationStore = create<ConversationStore>()(
  immer((set, get) => ({
    conversations:        {},
    activeConversationId: null,
    hydrated:             false,

    // ── Hydrate conversations (no messages — lazy loaded) ─────────
    hydrate: async () => {
      if (get().hydrated) return
      try {
        const convs = await window.orch.getConversations()
        set(state => {
          convs.forEach((c: Conversation) => { state.conversations[c.id] = c })
          state.hydrated = true
        })
      } catch {
        set(state => { state.hydrated = true })
      }
    },

    // ── Lazy-load messages for one conversation ───────────────────
    loadMessages: async (id) => {
      try {
        const msgs = await window.orch.getMessages(id)
        set(state => {
          if (state.conversations[id]) {
            state.conversations[id].messages = msgs
          }
        })
      } catch { /* ignore */ }
    },

    // ── Create ────────────────────────────────────────────────────
    createConversation: () => {
      const id  = nanoid()
      const now = Date.now()
      const conv: Conversation = {
        id, title: 'New Agent', status: 'idle',
        messages: [], createdAt: now, updatedAt: now,
      }
      set(state => {
        state.conversations[id] = conv
        state.activeConversationId = id
      })
      window.orch.saveConversation(conv)
      return id
    },

    // ── Delete ────────────────────────────────────────────────────
    deleteConversation: (id) => {
      set(state => {
        delete state.conversations[id]
        // Pick most-recently-updated remaining conversation
        const remaining = Object.values(state.conversations).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        )
        state.activeConversationId = remaining[0]?.id ?? null
      })
      window.orch.deleteConversation(id)
    },

    setActive: (id) => set(state => { state.activeConversationId = id }),

    setTitle: (id, title) => {
      set(state => { if (state.conversations[id]) state.conversations[id].title = title })
      const conv = get().conversations[id]
      if (conv) window.orch.saveConversation(conv)
    },

    setStatus: (id, status) => {
      set(state => {
        if (state.conversations[id]) {
          state.conversations[id].status    = status
          state.conversations[id].updatedAt = Date.now()
        }
      })
    },

    addMessage: (id, msg) => {
      set(state => {
        if (state.conversations[id]) {
          state.conversations[id].messages.push(msg)
          state.conversations[id].updatedAt = Date.now()
        }
      })
      window.orch.saveMessage(id, msg)
    },

    // ── Streaming append — does NOT persist mid-stream ────────────
    appendToLastAssistantMessage: (id, text, isThought = false) => {
      set(state => {
        const conv = state.conversations[id]
        if (!conv) return
        const last = conv.messages[conv.messages.length - 1]
        if (last && last.role === 'assistant' && last.streaming) {
          if (isThought) {
            last.thought = (last.thought || '') + text
          } else {
            last.content += text
          }
        } else {
          conv.messages.push({
            id:        nanoid(),
            role:      'assistant',
            type:      'text',
            content:   isThought ? '' : text,
            thought:   isThought ? text : undefined,
            timestamp: Date.now(),
            streaming: true,
          })
        }
      })
    },

    addToolCall: (id, name, args) => {
      const msgId = nanoid()
      const msg: Message = {
        id: msgId, role: 'assistant', type: 'tool_call',
        content: `Using ${name}`,
        toolCall: { name, args, status: 'running' },
        timestamp: Date.now(),
      }
      set(state => {
        if (state.conversations[id]) state.conversations[id].messages.push(msg)
      })
      window.orch.saveMessage(id, msg)
      return msgId
    },

    resolveToolCall: (id, msgId, result) => {
      set(state => {
        const conv = state.conversations[id]
        if (!conv) return
        const msg = conv.messages.find(m => m.id === msgId)
        if (msg?.toolCall) {
          msg.toolCall.result = result
          msg.toolCall.status = 'done'
        }
      })
    },

    // ── Finalize: clear streaming flag + PERSIST assistant message ─
    finalizeStreaming: (id) => {
      set(state => {
        const conv = state.conversations[id]
        if (!conv) return
        conv.messages.forEach(m => {
          if (m.streaming) {
            m.streaming = false
          }
        })
        conv.status    = 'done'
        conv.updatedAt = Date.now()
      })

      // Persist everything: conversation metadata + all streamed messages
      const conv = get().conversations[id]
      if (!conv) return
      window.orch.saveConversation(conv)

      // Save every assistant message that was built during streaming
      conv.messages
        .filter(m => m.role === 'assistant' && m.type === 'text')
        .forEach(m => window.orch.saveMessage(id, m))
    },
  })),
)
