export type ConversationStatus = 'idle' | 'running' | 'done' | 'error'

export type MessageRole = 'user' | 'assistant'

export type MessageType =
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'file_diff'
  | 'thinking'

export interface FileDiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
}

export interface FileDiff {
  path: string
  added: number
  removed: number
  lines: FileDiffLine[]
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
  result?: string
  status: 'running' | 'done' | 'error'
}

export interface Message {
  id: string
  role: MessageRole
  type: MessageType
  content: string
  toolCall?: ToolCall
  fileDiff?: FileDiff
  timestamp: number
  streaming?: boolean
  thought?: string
}

export interface Conversation {
  id: string
  title: string
  status: ConversationStatus
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
  expanded?: boolean
}

export interface OpenFile {
  path: string
  language: string
  isDirty: boolean
}

export interface WatcherEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}
