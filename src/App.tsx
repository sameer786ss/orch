import { useEffect } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { LeftSidebar } from './components/LeftSidebar/LeftSidebar'
import { AgentPanel } from './components/AgentPanel/AgentPanel'
import { EditorPanel } from './components/EditorPanel/EditorPanel'
import { useConversationStore } from './stores/useConversationStore'
import { useUIStore } from './stores/useUIStore'
import './App.css'

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

export default function App() {
  const { hydrate, createConversation, conversations, loadMessages } = useConversationStore()
  const { leftSidebarOpen, editorPanelOpen } = useUIStore()
  const activeConversationId = useConversationStore(s => s.activeConversationId)

  // Hydrate from SQLite on startup
  useEffect(() => {
    hydrate().then(() => {
      const { conversations: convs } = useConversationStore.getState()
      if (Object.keys(convs).length === 0) {
        createConversation()
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load messages when switching conversations
  useEffect(() => {
    if (activeConversationId) {
      const conv = conversations[activeConversationId]
      if (conv && conv.messages.length === 0) {
        loadMessages(activeConversationId)
      }
    }
  }, [activeConversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        {/* Left sidebar — conversation history */}
        <LeftSidebar open={leftSidebarOpen} />

        <PanelGroup direction="horizontal" autoSaveId="orch-layout">
          <Panel id="agent" order={1} defaultSize={45} minSize={20}>
            {/* Agent conversation panel — flexible center */}
            <AgentPanel />
          </Panel>

          {editorPanelOpen && (
            <>
              <PanelResizeHandle className="panel-resizer-handle" />
              <Panel id="editor" order={2} defaultSize={55} minSize={20}>
                {/* Editor panel — right side with Monaco + File Explorer */}
                <EditorPanel width="100%" />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  )
}
