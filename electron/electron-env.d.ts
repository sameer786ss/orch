/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT:    string
    VITE_PUBLIC: string
  }
}

// ── window.orch — full IPC bridge exposed from preload.ts ─────────
interface OrchBridge {
  // File System
  openFolder():                                           Promise<string | null>
  readFile(path: string):                                 Promise<string>
  writeFile(path: string, content: string):               Promise<boolean>
  createFile(path: string, content?: string):             Promise<boolean>
  deleteFile(path: string):                               Promise<boolean>
  listDir(path: string):                                  Promise<any[]>
  buildTree(path: string):                                Promise<any>

  // File Watcher
  startWatcher(workspace: string):                        Promise<boolean>
  stopWatcher():                                          Promise<boolean>
  onWatcherEvent(cb: (event: { type: string; path: string }) => void): () => void

  // Indexing
  startIndexing(workspace: string):                       Promise<boolean>
  onIndexProgress(cb: (data: { indexed: number; total: number; file: string }) => void): () => void

  // AI Agent (streaming via IPC events)
  startChat(conversationId: string, messages: Array<{ role: string; content: string }>, workspacePath: string | null): void
  onTextChunk(cb: (data: { conversationId: string; text: string; isThought?: boolean }) => void):                               () => void
  onToolCall(cb: (data: { conversationId: string; toolCallId: string; name: string; args: Record<string, unknown> }) => void): () => void
  onToolResult(cb: (data: { conversationId: string; toolCallId: string; name: string; result: string }) => void):             () => void
  onAiDone(cb: (data: { conversationId: string }) => void):                                               () => void
  onAiError(cb: (data: { conversationId: string; error: string }) => void):                               () => void

  // Database
  getConversations():                               Promise<any[]>
  getMessages(conversationId: string):              Promise<any[]>
  saveConversation(conv: any):                      Promise<boolean>
  saveMessage(conversationId: string, msg: any):    Promise<boolean>
  deleteConversation(id: string):                   Promise<boolean>

  // Web search
  webSearch(query: string, depth?: string): Promise<any>

  // Platform
  platform: string
}

interface Window {
  orch: OrchBridge
}
