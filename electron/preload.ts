import { ipcRenderer, contextBridge } from 'electron'

const ipc = {
  // ── File System ────────────────────────────────────────────────
  openFolder:  ()                             => ipcRenderer.invoke('fs:open-folder'),
  readFile:    (p: string)                    => ipcRenderer.invoke('fs:read-file', p),
  writeFile:   (p: string, c: string)         => ipcRenderer.invoke('fs:write-file', p, c),
  createFile:  (p: string, c?: string)        => ipcRenderer.invoke('fs:create-file', p, c),
  deleteFile:  (p: string)                    => ipcRenderer.invoke('fs:delete-file', p),
  listDir:     (p: string)                    => ipcRenderer.invoke('fs:list-dir', p),
  buildTree:   (p: string)                    => ipcRenderer.invoke('fs:build-tree', p),

  // ── File Watcher ────────────────────────────────────────────────
  startWatcher: (workspace: string)           => ipcRenderer.invoke('fs:watch-start', workspace),
  stopWatcher:  ()                            => ipcRenderer.invoke('fs:watch-stop'),
  onWatcherEvent: (cb: (event: any) => void) => {
    const fn = (_: any, e: any) => cb(e)
    ipcRenderer.on('fs:watcher-event', fn)
    return () => ipcRenderer.off('fs:watcher-event', fn)
  },

  // ── Indexing ────────────────────────────────────────────────────
  startIndexing: (workspace: string)          => ipcRenderer.invoke('index:start', workspace),
  onIndexProgress: (cb: (data: any) => void) => {
    const fn = (_: any, d: any) => cb(d)
    ipcRenderer.on('index:progress', fn)
    return () => ipcRenderer.off('index:progress', fn)
  },

  // ── AI Agent (streaming via IPC events) ─────────────────────────
  // MUST use ipcRenderer.send (fire-and-forget), NOT invoke.
  // invoke() blocks the renderer awaiting a return value — all subsequent
  // ai:text-chunk / ai:tool-call events are queued and never processed until
  // the entire session finishes, making streaming appear frozen in the UI.
  startChat: (conversationId: string, messages: any[], workspacePath: string | null) =>
    ipcRenderer.send('ai:start-chat', { conversationId, messages, workspacePath }),

  onTextChunk: (cb: (data: { conversationId: string; text: string; isThought?: boolean }) => void) => {
    const fn = (_: any, d: any) => cb(d)
    ipcRenderer.on('ai:text-chunk', fn)
    return () => ipcRenderer.off('ai:text-chunk', fn)
  },
  onToolCall: (cb: (data: { conversationId: string; toolCallId: string; name: string; args: Record<string, unknown> }) => void) => {
    const fn = (_: any, d: any) => cb(d)
    ipcRenderer.on('ai:tool-call', fn)
    return () => ipcRenderer.off('ai:tool-call', fn)
  },
  onToolResult: (cb: (data: { conversationId: string; toolCallId: string; name: string; result: string }) => void) => {
    const fn = (_: any, d: any) => cb(d)
    ipcRenderer.on('ai:tool-result', fn)
    return () => ipcRenderer.off('ai:tool-result', fn)
  },
  onAiDone: (cb: (data: { conversationId: string }) => void) => {
    const fn = (_: any, d: any) => cb(d)
    ipcRenderer.on('ai:done', fn)
    return () => ipcRenderer.off('ai:done', fn)
  },
  onAiError: (cb: (data: any) => void) => {
    const fn = (_: any, d: any) => cb(d)
    ipcRenderer.on('ai:error', fn)
    return () => ipcRenderer.off('ai:error', fn)
  },

  // ── Database ────────────────────────────────────────────────────
  getConversations:  ()                               => ipcRenderer.invoke('db:get-conversations'),
  getMessages:       (conversationId: string)         => ipcRenderer.invoke('db:get-messages', conversationId),
  saveConversation:  (conv: any)                      => ipcRenderer.invoke('db:save-conversation', conv),
  saveMessage:       (convId: string, msg: any)       => ipcRenderer.invoke('db:save-message', convId, msg),
  deleteConversation:(id: string)                     => ipcRenderer.invoke('db:delete-conversation', id),

  // ── Web Search (Tavily) ─────────────────────────────────────────────────
  webSearch: (query: string, depth?: string) => ipcRenderer.invoke('web:search', query, depth),

  // ── Platform ────────────────────────────────────────────────────
  platform: process.platform,
}

contextBridge.exposeInMainWorld('orch', ipc)
