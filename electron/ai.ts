/**
 * ai.ts — NVIDIA NIM × Kimi-K2-Thinking + Tavily Web Search
 *
 * Architecture:
 *  - Chat: NVIDIA NIM API (OpenAI-compatible) → moonshotai/kimi-k2-thinking
 *  - Web Search: @tavily/core SDK (Electron main process, never renderer)
 *  - Embeddings: still uses a fast local model via NVIDIA NIM text-embedding endpoint
 *
 * All API calls stay in the Electron main process for security.
 */

import OpenAI from 'openai'
import { tavily } from '@tavily/core'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { dbSaveIndexedFile, dbGetIndexedFile, dbSaveEmbeddingsBatch } from './db'

const execFileAsync = promisify(execFile)

// ── NVIDIA NIM client (OpenAI-compatible) ────────────────────────────────────
const nim = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || '',
  baseURL: 'https://integrate.api.nvidia.com/v1',
})

// ── Tavily search client ──────────────────────────────────────────────────────
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY || '' })

// ── Models ────────────────────────────────────────────────────────────────────
const CHAT_MODEL = 'z-ai/glm4.7' // fastest Kimi-K2 variant on NIM
const EMBED_MODEL = 'nvidia/nv-embedqa-e5-v5'      // NVIDIA NIM embedding model

const DEFAULT_TOOL_TIMEOUT_MS = 30_000
const MAX_TOOL_TIMEOUT_MS = 120_000
const TOOL_OUTPUT_BUFFER_BYTES = 2 * 1024 * 1024

function isPathInside(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function requireWorkspaceRoot(workspaceRoot: string | null): string {
  if (!workspaceRoot) {
    throw new Error('This tool requires an open workspace.')
  }
  return workspaceRoot
}

function resolveWorkspacePath(workspaceRoot: string, candidatePath: string): string {
  const resolved = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(workspaceRoot, candidatePath)

  if (!isPathInside(resolved, workspaceRoot)) {
    throw new Error('Tool path is outside the active workspace.')
  }
  return resolved
}

function clampTimeout(timeoutMs: unknown): number {
  const value = Number(timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TOOL_TIMEOUT_MS
  return Math.min(value, MAX_TOOL_TIMEOUT_MS)
}

function assertSafeShellCommand(command: string) {
  const dangerousPatterns = [
    /\bsudo\b/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bmkfs(\.[\w-]+)?\b/i,
    /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\};\s*:/,
    /\bdd\s+if=.*\s+of=\/dev\//i,
    /\brm\s+-rf\s+\/$/i,
    /\brm\s+-rf\s+\/\s+/i,
  ]
  if (dangerousPatterns.some(p => p.test(command))) {
    throw new Error('Blocked potentially dangerous command.')
  }
}

function sanitizeIncludeGlob(input: string): string {
  return input.replace(/[\r\n\0]/g, '').trim().slice(0, 120)
}

// ── System Prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(workspacePath: string | null): string {
  const ws = workspacePath ?? '/tmp'
  return [
    '# Orch — Elite Agentic Coding Assistant',
    '',
    `You are Orch, powered by Kimi-K2 (Moonshot AI) via NVIDIA NIM — a 1-trillion-parameter`,
    `Mixture-of-Experts model purpose-built for autonomous coding and agentic tasks.`,
    '',
    `## Workspace`,
    workspacePath
      ? `Current workspace root: ${workspacePath}\nAll relative paths resolve from this directory.`
      : 'No workspace open. Use absolute paths or ask the user to open a folder.',
    '',
    '## Your Tools',
    '',
    '### web_search(query, search_depth?)',
    '  Search the web for current docs, packages, APIs, error messages, best practices.',
    '  ALWAYS search before recommending packages, versions, or APIs you may not know exactly.',
    '',
    `### run_command(command, cwd?, timeout_ms?)`,
    `  Execute any shell command. Default cwd: ${ws}`,
    '  Use for: npm/pip/cargo install, git, build, test, lint, file operations, etc.',
    '  Example: run_command("npm create vite@latest my-app -- --template react-ts", cwd="${ws}")',
    '',
    '### read_file(path)',
    '  Read a file. Always read before modifying.',
    '',
    '### write_file(path, content)',
    '  Write/create a file. Creates parent directories automatically.',
    '',
    '### list_directory(path)',
    '  List directory contents.',
    '',
    '### delete_file(path)',
    '  Delete a file or directory.',
    '',
    '### search_codebase(query, file_glob?)',
    '  Search files in the workspace for a pattern.',
    '',
    '## How To Build Complete Apps',
    '',
    'When asked to build a website, app, CLI tool, or any project:',
    '1. web_search for the latest stack, packages, and scaffold commands.',
    '2. run_command to scaffold/initialize the project.',
    '3. read_file existing files to understand structure.',
    '4. write_file to create all necessary source files (complete, working code).',
    '5. run_command to install deps, then build/test to verify.',
    '6. Confirm what was created and how to run it.',
    '',
    'NEVER stop halfway. Complete the task fully. If something fails, debug it with run_command.',
    'Write COMPLETE file contents — never truncate with "..." or "// rest of code".',
    '',
    '## Rules',
    '- Think thoroughly before acting. Use reasoning.',
    '- Read files before modifying them.',
    '- Use absolute paths in write_file/read_file/delete_file.',
    '- Use web_search for any version-specific, API, or package info.',
    '- After completing, summarize exactly what was done.',
    '- Be concise in your final response — the work speaks for itself.',
  ].join('\n')
}


// ── Tool definitions (OpenAI function-calling format) ─────────────────────────
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for up-to-date information. Use this for docs, packages, APIs, error messages, best practices, or any real-world knowledge.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A concise, specific search query (under 400 characters).',
          },
          search_depth: {
            type: 'string',
            enum: ['basic', 'advanced'],
            description: 'basic = fast/real-time, advanced = deep research. Default: basic.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file from the filesystem.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file.' },
          content: { type: 'string', description: 'Content to write.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories at a given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the directory.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Execute a shell command in the workspace directory. Use to run builds, tests, install packages, git commands, etc. Captures stdout and stderr.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute (e.g. "npm install", "git status", "python main.py").',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command. Defaults to the workspace root.',
          },
          timeout_ms: {
            type: 'number',
            description: 'Timeout in milliseconds. Default: 30000 (30s). Max: 120000 (2min).',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_codebase',
      description: 'Search for a text pattern or keyword across all files in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text pattern to search for.',
          },
          file_glob: {
            type: 'string',
            description: 'Optional glob to filter files, e.g. "**/*.ts" or "src/**/*.tsx".',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory recursively.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to delete.' },
        },
        required: ['path'],
      },
    },
  },
]

// ── Tool execution ────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  workspaceRoot: string | null,
): Promise<string> {
  try {
    switch (name) {
      case 'web_search': {
        const query = args.query as string
        const depth = (args.search_depth as string) ?? 'basic'
        console.log('[AI] web_search:', query, 'depth:', depth)
        const result = await tvly.search(query, {
          searchDepth: depth as 'basic' | 'advanced',
          maxResults: 6,
          includeAnswer: true,
          includeRawContent: false,
        })
        const answer = result.answer ? `Summary: ${result.answer}\n\n` : ''
        const sources = result.results
          .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content?.slice(0, 600)}`)
          .join('\n\n---\n\n')
        return answer + sources
      }

      case 'read_file': {
        const root = requireWorkspaceRoot(workspaceRoot)
        const filePath = resolveWorkspacePath(root, String(args.path ?? ''))
        console.log('[AI] read_file:', filePath)
        const content = await fsPromises.readFile(filePath, 'utf-8')
        return content
      }

      case 'write_file': {
        const root = requireWorkspaceRoot(workspaceRoot)
        const filePath = resolveWorkspacePath(root, String(args.path ?? ''))
        const content = String(args.content ?? '')
        console.log('[AI] write_file:', filePath, 'len:', content.length)
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
        await fsPromises.writeFile(filePath, content, 'utf-8')
        return `Successfully wrote ${content.length} bytes to ${filePath}`
      }

      case 'list_directory': {
        const root = requireWorkspaceRoot(workspaceRoot)
        const dirPath = resolveWorkspacePath(root, String(args.path ?? ''))
        console.log('[AI] list_directory:', dirPath)
        const entries = await fsPromises.readdir(dirPath, { withFileTypes: true })
        const lines = entries.map(e => `${e.isDirectory() ? 'DIR ' : 'FILE'} ${e.name}`)
        return lines.join('\n') || '(empty directory)'
      }

      case 'run_command': {
        const root = requireWorkspaceRoot(workspaceRoot)
        const command = String(args.command ?? '').trim()
        if (!command) {
          return 'run_command requires a non-empty command.'
        }
        assertSafeShellCommand(command)

        const requestedCwd = String(args.cwd ?? '').trim()
        const cwd = requestedCwd ? resolveWorkspacePath(root, requestedCwd) : root
        const timeoutMs = clampTimeout(args.timeout_ms)

        console.log('[AI] run_command:', command, 'cwd:', cwd)
        try {
          const { stdout, stderr } = await execFileAsync(
            '/bin/sh', ['-c', command],
            { cwd, timeout: timeoutMs, maxBuffer: TOOL_OUTPUT_BUFFER_BYTES },
          )
          const out = [stdout, stderr].filter(Boolean).join('\n--- stderr ---\n')
          return out || '(command completed with no output)'
        } catch (e: any) {
          const out = [e.stdout, e.stderr].filter(Boolean).join('\n')
          return `Exit ${e.code ?? 1}:\n${out || e.message}`
        }
      }

      case 'search_codebase': {
        const root = requireWorkspaceRoot(workspaceRoot)
        const query = String(args.query ?? '').trim()
        if (!query) {
          return 'search_codebase requires a non-empty query.'
        }

        const fileGlobRaw = String(args.file_glob ?? '').trim()
        const fileGlob = fileGlobRaw ? sanitizeIncludeGlob(fileGlobRaw) : ''
        console.log('[AI] search_codebase:', query, 'glob:', fileGlob)

        const grepArgs = [
          '-R',
          '-n',
          '-I',
          '--line-number',
          '--exclude-dir=.git',
          '--exclude-dir=node_modules',
          '--exclude-dir=dist',
          '--exclude-dir=dist-electron',
        ]
        if (fileGlob) grepArgs.push(`--include=${fileGlob}`)
        grepArgs.push(query, '.')

        try {
          const { stdout } = await execFileAsync('/usr/bin/grep', grepArgs, {
            cwd: root,
            timeout: 10_000,
            maxBuffer: 1024 * 1024,
          })
          const matches = stdout
            .split('\n')
            .filter(Boolean)
            .slice(0, 50)
          return matches.join('\n') || '(no matches found)'
        } catch (err: any) {
          if (err?.code === 1) return '(no matches found)'
          return '(no matches found)'
        }
      }

      case 'delete_file': {
        const root = requireWorkspaceRoot(workspaceRoot)
        const filePath = resolveWorkspacePath(root, String(args.path ?? ''))
        console.log('[AI] delete_file:', filePath)
        await fsPromises.rm(filePath, { recursive: true, force: true })
        return `Deleted: ${filePath}`
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err: any) {
    console.error('[AI] tool error:', name, err.message)
    return `Error executing ${name}: ${err.message}`
  }
}

// ── Agentic Chat Loop ─────────────────────────────────────────────────────────
export async function runAgentChat(
  event: Electron.IpcMainEvent,
  conversationId: string,
  messages: Array<{ role: string; content: string }>,
  workspacePath: string | null,
) {
  console.log('[AI] runAgentChat — Kimi-K2 via NVIDIA NIM, convId:', conversationId)
  const workspaceRoot = workspacePath ? path.resolve(workspacePath) : null

  // Build OpenAI-format message history
  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(workspaceRoot) },
    ...messages
      .filter(m => m.content.trim())
      .map(m => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      })),
  ]

  if (history.length === 1) {
    history.push({ role: 'user', content: 'Hello' })
  }

  // ── Agentic loop — runs until model stops calling tools ──────────────────
  const MAX_ITERATIONS = 20
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log('[AI] iteration', iteration + 1, 'of', MAX_ITERATIONS)

    try {
      const stream = await nim.chat.completions.create({
        model: CHAT_MODEL,
        messages: history,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 1,
        top_p: 0.9,
        max_tokens: 16384,
        stream: true,
      })

      // Accumulate full response from stream
      let fullContent = ''
      let fullReasoning = ''
      const toolCallAcc: Record<string, { name: string; args: string }> = {}

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta
        if (!delta) continue

        // ── Reasoning / thinking content ─────────────────────────────────
        const reasoning = (delta as any).reasoning_content
        if (reasoning) {
          fullReasoning += reasoning
          event.reply('ai:text-chunk', { conversationId, text: reasoning, isThought: true })
        }

        // ── Regular content ───────────────────────────────────────────────
        if (delta.content) {
          fullContent += delta.content
          event.reply('ai:text-chunk', { conversationId, text: delta.content })
        }

        // ── Tool call accumulation (streaming chunks must be merged) ──────
        if (delta.tool_calls) {
          for (const tcDelta of delta.tool_calls) {
            const idx = tcDelta.index ?? 0
            if (!toolCallAcc[idx]) {
              // First chunk for this tool call — initialize with name from this chunk
              toolCallAcc[idx] = { name: tcDelta.function?.name ?? '', args: '' }
            } else {
              // Subsequent chunks — name may arrive again (some APIs) or be empty
              // Only append if name is genuinely a continuation (i.e. current name is still empty)
              if (tcDelta.function?.name && !toolCallAcc[idx].name) {
                toolCallAcc[idx].name = tcDelta.function.name
              }
            }
            // Always accumulate arguments (they stream across many chunks)
            if (tcDelta.function?.arguments) toolCallAcc[idx].args += tcDelta.function.arguments
          }
        }
      }

      const toolCalls = Object.values(toolCallAcc)

      // ── No tool calls → conversation turn is complete ─────────────────
      if (toolCalls.length === 0) {
        // Push assistant message into history for future reference
        history.push({ role: 'assistant', content: fullContent })
        break
      }

      // ── Push assistant message with tool_calls into history ───────────
      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        role: 'assistant',
        content: fullContent || null,
        tool_calls: toolCalls.map((tc, i) => ({
          id: `call_${i}_${Date.now()}`,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.args },
        })),
      }
      history.push(assistantMsg)

      // ── Execute each tool and push results ────────────────────────────
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        const tcId = (assistantMsg as any).tool_calls[i].id
        let parsedArgs: Record<string, unknown> = {}

        try {
          parsedArgs = JSON.parse(tc.args || '{}')
        } catch {
          parsedArgs = {}
        }

        console.log('[AI] calling tool:', tc.name, 'args:', JSON.stringify(parsedArgs).slice(0, 120))

        // Notify renderer — tool is starting
        event.reply('ai:tool-call', {
          conversationId,
          toolCallId: tcId,
          name: tc.name,
          args: parsedArgs,
        })

        const result = await executeTool(tc.name, parsedArgs, workspaceRoot)
        console.log('[AI] tool result preview:', result.slice(0, 120))

        // Notify renderer — tool finished
        event.reply('ai:tool-result', {
          conversationId,
          toolCallId: tcId,
          name: tc.name,
          result: result.slice(0, 300),
        })

        // Push tool result into history
        history.push({
          role: 'tool',
          tool_call_id: tcId,
          content: result,
        })
      }

      // Continue loop — model will process tool results and reply
    } catch (err: any) {
      console.error('[AI] stream error on iteration', iteration, ':', err.message)
      throw err
    }
  }

  console.log('[AI] agent loop complete, sending ai:done')
  event.reply('ai:done', { conversationId })
}

// ── Embeddings ────────────────────────────────────────────────────────────────
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await nim.embeddings.create({
      model: EMBED_MODEL,
      input: text,
      // nvidia/nv-embedqa-e5-v5 is an asymmetric model — input_type is required
      encoding_format: 'float',
      input_type: 'passage',
      truncate: 'END'
    } as any)
    return (response.data[0] as any)?.embedding ?? []
  } catch (err: any) {
    console.warn('[AI] embedding failed:', err.message)
    return []
  }
}

// ── File Indexing ──────────────────────────────────────────────────────────────
export async function indexFile(workspace: string, filePath: string) {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    if (content.length > 200_000) return // skip huge files

    const hash = createHash('md5').update(content).digest('hex')
    const existing = await dbGetIndexedFile(workspace, filePath)
    if (existing?.content_hash === hash) return // unchanged

    const fileId = createHash('md5').update(`${workspace}:${filePath}`).digest('hex')
    await dbSaveIndexedFile(fileId, workspace, filePath, hash)

    const rawChunks = chunkText(content, 500, 50)
    const batch: Array<{ idx: number; text: string; emb: number[] }> = []
    for (let i = 0; i < rawChunks.length; i++) {
      const emb = await getEmbedding(rawChunks[i])
      if (emb.length) batch.push({ idx: i, text: rawChunks[i], emb })
    }

    if (batch.length) await dbSaveEmbeddingsBatch(fileId, batch)
  } catch { /* skip unreadable files */ }
}

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + size))
    start += size - overlap
  }
  return chunks
}
