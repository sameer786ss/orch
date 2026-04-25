import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { Loader2, CheckCircle2, XCircle, File, Search, FolderOpen, Terminal, Globe, Wrench } from 'lucide-react'
import type { Message } from '../../types'

// ── Tool icons map ────────────────────────────────────────────────────────────
function getToolIcon(name: string) {
  if (name === 'web_search')       return Globe
  if (name === 'run_command')      return Terminal
  if (name === 'search_codebase')  return Search
  if (name.includes('dir') || name.includes('list')) return FolderOpen
  if (name.includes('file') || name.includes('read') || name.includes('write') || name.includes('create') || name.includes('delete')) return File
  return Wrench
}

function getToolLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'web_search':      return String(args.query ?? '').slice(0, 60)
    case 'run_command':     return String(args.command ?? '').slice(0, 40) + (String(args.command ?? '').length > 40 ? '...' : '')
    case 'search_codebase': return String(args.query ?? '').slice(0, 60)
    case 'read_file':
    case 'write_file':
    case 'create_file':
    case 'delete_file':
    case 'list_directory': {
      const p = String(args.path ?? '')
      const parts = p.split('/').filter(Boolean)
      return parts[parts.length - 1] || p
    }
    default:                return ''
  }
}

function getToolName(name: string, status: string): string {
  const isRunning = status === 'running'
  switch (name) {
    case 'web_search':      return isRunning ? 'Searching web' : 'Searched web'
    case 'run_command':     return isRunning ? 'Running' : 'Ran'
    case 'read_file':       return isRunning ? 'Reading' : 'Read'
    case 'write_file':      return isRunning ? 'Editing' : 'Edited'
    case 'create_file':     return isRunning ? 'Creating' : 'Created'
    case 'delete_file':     return isRunning ? 'Deleting' : 'Deleted'
    case 'list_directory':  return isRunning ? 'Analyzing' : 'Analyzed'
    case 'search_codebase': return isRunning ? 'Searching codebase' : 'Searched codebase'
    default:                return name
  }
}

// ── Minimal Inline Tool Card ──────────────────────────────────────────────────
export const ToolCallItem: React.FC<{ message: Message }> = ({ message }) => {
  const tc = message.toolCall
  if (!tc) return null

  const Icon  = getToolIcon(tc.name)
  const label = getToolLabel(tc.name, tc.args)

  return (
    <div className="tool-card">
      <span className="tool-card-status">
        {tc.status === 'running' ? (
          <Loader2 size={11} className="spinning" />
        ) : tc.status === 'error' ? (
          <XCircle size={11} style={{ color: 'var(--danger)' }} />
        ) : (
          <CheckCircle2 size={11} style={{ color: 'var(--success)' }} />
        )}
      </span>
      <Icon size={11} className="tool-card-icon" />
      <span className="tool-card-name">{getToolName(tc.name, tc.status)}</span>
      {label && <span className="tool-card-label">{label}</span>}
    </div>
  )
}

// ── Thinking Block — always collapsible, auto-scrolls while streaming ─────────
const ThinkingBlock: React.FC<{ thought: string; streaming: boolean }> = ({ thought, streaming }) => {
  const [open, setOpen] = React.useState(true)
  const bodyRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom while actively streaming
  React.useEffect(() => {
    if (open && streaming && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [thought, open, streaming])

  // Auto-close when streaming finishes
  React.useEffect(() => {
    if (!streaming) {
      setOpen(false)
    }
  }, [streaming])

  return (
    <div className="thinking-block">
      <button
        className="thinking-toggle"
        onClick={() => setOpen(o => !o)}
      >
        <span className="thinking-chevron" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        <span>Thinking</span>
        {streaming && open && (
          <span className="thinking-streaming-dot" />
        )}
      </button>
      {open && (
        <div ref={bodyRef} className="thinking-content">
          {thought}
        </div>
      )}
    </div>
  )
}

// ── Thinking dots indicator (before first token) ─────────────────────────────
export const ThinkingIndicator: React.FC = () => (
  <div className="thinking-indicator">
    <div className="thinking-dots">
      <div className="thinking-dot" />
      <div className="thinking-dot" />
      <div className="thinking-dot" />
    </div>
    <span>Thinking…</span>
  </div>
)

// ── File Diff ─────────────────────────────────────────────────────────────────
export const FileDiffView: React.FC<{ message: Message }> = ({ message }) => {
  const diff = message.fileDiff
  if (!diff) return null
  return (
    <div className="file-diff">
      <div className="file-diff-header">
        <File size={12} />
        <span className="file-diff-path">{diff.path.split('/').slice(-2).join('/')}</span>
        <span className="diff-badge-add">+{diff.added}</span>
        <span className="diff-badge-remove">-{diff.removed}</span>
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {diff.lines.map((line, i) => (
          <div key={i} className={`diff-line ${line.type}`}>
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            {line.content}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Message Bubble ────────────────────────────────────────────────────────────
export const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  if (message.role === 'user') {
    return (
      <div className="message-item">
        <div className="message-user">
          <div className="message-user-bubble">{message.content}</div>
        </div>
      </div>
    )
  }

  if (message.type === 'tool_call') {
    return (
      <div className="message-item message-item--tool">
        <ToolCallItem message={message} />
      </div>
    )
  }

  if (message.type === 'file_diff') {
    return (
      <div className="message-item">
        <FileDiffView message={message} />
      </div>
    )
  }

  // Assistant text message
  const hasThought  = Boolean(message.thought)
  const hasContent  = Boolean(message.content)
  const isStreaming = Boolean(message.streaming)

  return (
    <div className="message-item">
      <div className="message-assistant">
        {/* Dots indicator — only when nothing has arrived yet */}
        {isStreaming && !hasContent && !hasThought && <ThinkingIndicator />}

        {/* Thinking block — collapsible, always visible if there's thought text */}
        {hasThought && (
          <ThinkingBlock thought={message.thought!} streaming={isStreaming && !hasContent} />
        )}

        {/* Main response */}
        {hasContent && (
          <div className="message-assistant-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
