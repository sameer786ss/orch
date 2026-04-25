import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as fsPromises from 'node:fs/promises'
import 'dotenv/config'

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath((import.meta as any).url))

// ── GPU / Performance flags (platform-safe) ──────────────────────
app.commandLine.appendSwitch('use-mock-keychain')
app.commandLine.appendSwitch('password-store', 'basic')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

// Platform-specific flags
if (process.platform !== 'darwin') {
  app.commandLine.appendSwitch('force_high_performance_gpu')
}
if (process.platform === 'linux') {
  // VaapiVideoDecoder is Linux-only
  app.commandLine.appendSwitch(
    'enable-features',
    'CanvasOopRasterization,VaapiVideoDecoder',
  )
} else {
  app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization')
}

process.env.APP_ROOT = path.join(_dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST           = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST       = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null
let currentWorkspacePath: string | null = null

function resolveSafePath(inputPath: string): string {
  return path.resolve(inputPath)
}

function isPathInside(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function ensureWorkspacePath(): string {
  if (!currentWorkspacePath) {
    throw new Error('No workspace selected')
  }
  return currentWorkspacePath
}

function assertPathInWorkspace(targetPath: string): string {
  const workspace = ensureWorkspacePath()
  const resolved = resolveSafePath(targetPath)
  if (!isPathInside(resolved, workspace)) {
    throw new Error('Path is outside the active workspace')
  }
  return resolved
}

function setWorkspacePath(workspacePath: string): string {
  const resolved = resolveSafePath(workspacePath)
  currentWorkspacePath = resolved
  return resolved
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, 'electron-vite.svg'),
    backgroundColor: '#0d0d0d',
    show: false,
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d0d0d',
      symbolColor: '#888888',
      height: 38,
    },
    webPreferences: {
      preload: path.join(_dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.platform === 'darwin') {
    win.setWindowButtonPosition({ x: 14, y: 12 })
  }

  win.once('ready-to-show', () => win?.show())

  // ── Forward renderer logs to terminal only in dev ───────────────
  if (VITE_DEV_SERVER_URL) {
    win.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
      const levelName = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || 'LOG'
      console.log(`[RENDERER-${levelName}] ${message}`)
    })
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// ── IPC: File System ──────────────────────────────────────────────
ipcMain.handle('fs:open-folder', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  })
  const selected = result.filePaths[0] ?? null
  if (selected) setWorkspacePath(selected)
  return selected
})

ipcMain.handle('fs:read-file', async (_, filePath: string) => {
  const safePath = assertPathInWorkspace(filePath)
  return fsPromises.readFile(safePath, 'utf-8')
})

ipcMain.handle('fs:write-file', async (_, filePath: string, content: string) => {
  const safePath = assertPathInWorkspace(filePath)
  await fsPromises.writeFile(safePath, content, 'utf-8')
  return true
})

ipcMain.handle('fs:create-file', async (_, filePath: string, content = '') => {
  const safePath = assertPathInWorkspace(filePath)
  await fsPromises.mkdir(path.dirname(safePath), { recursive: true })
  await fsPromises.writeFile(safePath, content, 'utf-8')
  return true
})

ipcMain.handle('fs:delete-file', async (_, filePath: string) => {
  const safePath = assertPathInWorkspace(filePath)
  await fsPromises.rm(safePath, { recursive: true, force: true })
  return true
})

ipcMain.handle('fs:list-dir', async (_, dirPath: string) => {
  const safePath = assertPathInWorkspace(dirPath)
  const { expandDir } = await import('./indexer')
  return expandDir(safePath)
})

ipcMain.handle('fs:build-tree', async (_, dirPath: string) => {
  const safePath = assertPathInWorkspace(dirPath)
  const { buildFileTree } = await import('./indexer')
  return buildFileTree(safePath)
})

// ── IPC: File Watcher ─────────────────────────────────────────────
ipcMain.handle('fs:watch-start', async (_, workspace: string) => {
  const safeWorkspace = setWorkspacePath(workspace)
  const { startWatcher } = await import('./indexer')
  startWatcher(safeWorkspace, event => {
    win?.webContents.send('fs:watcher-event', event)
  })
  return true
})

ipcMain.handle('fs:watch-stop', async () => {
  const { stopWatcher } = await import('./indexer')
  stopWatcher()
  return true
})

// ── IPC: Indexing ─────────────────────────────────────────────────
ipcMain.handle('index:start', async (_, workspace: string) => {
  const safeWorkspace = setWorkspacePath(workspace)
  const { startIndexing } = await import('./indexer')
  startIndexing(safeWorkspace, (indexed, total, file) => {
    win?.webContents.send('index:progress', { indexed, total, file })
  })
  return true
})

// ── IPC: AI Agent ─────────────────────────────────────────────────
// MUST be ipcMain.on (fire-and-forget) — NOT ipcMain.handle.
// ipcMain.handle makes the renderer await the entire session, blocking all
// ai:text-chunk / ai:tool-call events from being processed. ipcMain.on returns
// immediately so the renderer's event loop is free to receive streaming events.
ipcMain.on('ai:start-chat', async (event, { conversationId, messages, workspacePath }) => {
  console.log('[MAIN] ai:start-chat received, convId:', conversationId, 'msgs:', messages?.length)
  const { runAgentChat } = await import('./ai')
  try {
    await runAgentChat(event, conversationId, messages, workspacePath)
  } catch (err: any) {
    console.error('[MAIN] runAgentChat threw:', err.message)
    event.reply('ai:error', { conversationId, error: err.message })
    event.reply('ai:done',  { conversationId })
  }
})

// ── IPC: Web Search (Tavily) ──────────────────────────────────────────────
ipcMain.handle('web:search', async (_, query: string, depth = 'basic') => {
  const { tavily } = await import('@tavily/core')
  const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY || '' })
  try {
    const result = await tvly.search(query, {
      searchDepth:   depth as 'basic' | 'advanced',
      maxResults:    6,
      includeAnswer: true,
    })
    return result
  } catch (err: any) {
    console.error('[MAIN] web:search error:', err.message)
    return { error: err.message }
  }
})

// ── IPC: Database ─────────────────────────────────────────────────
ipcMain.handle('db:get-conversations', async () => {
  const { dbGetConversations } = await import('./db')
  return dbGetConversations()
})

ipcMain.handle('db:get-messages', async (_, conversationId: string) => {
  const { dbGetMessages } = await import('./db')
  return dbGetMessages(conversationId)
})

ipcMain.handle('db:save-conversation', async (_, conv: any) => {
  const { dbSaveConversation } = await import('./db')
  await dbSaveConversation(conv)
  return true
})

ipcMain.handle('db:save-message', async (_, conversationId: string, msg: any) => {
  const { dbSaveMessage } = await import('./db')
  await dbSaveMessage(conversationId, msg)
  return true
})

ipcMain.handle('db:delete-conversation', async (_, id: string) => {
  const { dbDeleteConversation } = await import('./db')
  await dbDeleteConversation(id)
  return true
})

// ── App Lifecycle ─────────────────────────────────────────────────
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', async () => {
  const [{ stopWatcher }, { dbFlushNow }] = await Promise.all([
    import('./indexer'),
    import('./db'),
  ])
  stopWatcher()
  dbFlushNow()
})

app.whenReady().then(createWindow)
