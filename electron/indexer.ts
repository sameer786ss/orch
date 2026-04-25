import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import chokidar, { FSWatcher } from 'chokidar'
import { indexFile } from './ai'
import { dbDeleteIndexedFile, dbDeleteIndexedPathPrefix } from './db'

// ── Ignored patterns ─────────────────────────────────────────────
// Using regex-style checks rather than naive string.includes to avoid
// false positives (e.g. a folder named "my-lock-box" being skipped)
const IGNORED_NAMES = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'build',
  '.next', '.nuxt', 'coverage', '__pycache__', '.venv',
  '.DS_Store', '.turbo', 'out', '.svelte-kit',
])

const IGNORED_EXTS = new Set(['.lock', '.log', '.map', '.min.js', '.min.css'])

function isIgnoredName(name: string): boolean {
  return IGNORED_NAMES.has(name)
}

function isIgnoredExt(name: string): boolean {
  const lower = name.toLowerCase()
  for (const ext of IGNORED_EXTS) {
    if (lower.endsWith(ext)) return true
  }
  return false
}

/** Chokidar ignored function — checks every path segment, not the whole string */
function chokidarIgnored(filePath: string): boolean {
  const segments = filePath.split(path.sep)
  return segments.some(seg => isIgnoredName(seg) || isIgnoredExt(seg))
}

// ── Text extensions for indexing ─────────────────────────────────
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
  '.kt', '.vue', '.svelte', '.html', '.css', '.scss', '.sass',
  '.less', '.json', '.yaml', '.yml', '.toml', '.md', '.mdx',
  '.txt', '.sh', '.bash', '.zsh',
])

const TEXT_FILENAMES = new Set([
  '.env',
  '.gitignore',
  '.npmrc',
  '.eslintrc',
  '.prettierrc',
])

export function isIndexable(filePath: string): boolean {
  const baseName = path.basename(filePath).toLowerCase()
  if (TEXT_FILENAMES.has(baseName)) return true
  return TEXT_EXTS.has(path.extname(baseName).toLowerCase())
}

// ── Watcher ───────────────────────────────────────────────────────
let watcher: FSWatcher | null = null

export function startWatcher(
  workspace: string,
  onChange: (event: { type: string; path: string }) => void,
) {
  stopWatcher()

  watcher = chokidar.watch(workspace, {
    ignored: chokidarIgnored,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })

  watcher
    .on('add',       p => { onChange({ type: 'add',       path: p }); if (isIndexable(p)) indexFile(workspace, p) })
    .on('change',    p => { onChange({ type: 'change',    path: p }); if (isIndexable(p)) indexFile(workspace, p) })
    .on('unlink',    p => {
      onChange({ type: 'unlink', path: p })
      dbDeleteIndexedFile(workspace, p).catch(() => {})
    })
    .on('addDir',    p =>   onChange({ type: 'addDir',    path: p }))
    .on('unlinkDir', p => {
      onChange({ type: 'unlinkDir', path: p })
      dbDeleteIndexedPathPrefix(workspace, p).catch(() => {})
    })
}

export function stopWatcher() {
  watcher?.close()
  watcher = null
}

// ── Indexing singleton guard ──────────────────────────────────────
let isIndexing = false

export async function startIndexing(
  workspace: string,
  onProgress: (indexed: number, total: number, file: string) => void,
) {
  if (isIndexing) return // prevent duplicate indexing runs
  isIndexing = true
  try {
    const files = await walkDir(workspace)
    const indexable = files.filter(isIndexable)
    let indexed = 0
    for (const filePath of indexable) {
      await indexFile(workspace, filePath)
      indexed++
      onProgress(indexed, indexable.length, filePath)
    }
  } finally {
    isIndexing = false
  }
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = []
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (isIgnoredName(entry.name) || isIgnoredExt(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...(await walkDir(fullPath)))
      } else {
        results.push(fullPath)
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results
}

// ── File Tree ─────────────────────────────────────────────────────
export async function buildFileTree(dirPath: string): Promise<any> {
  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true })
    const children = await Promise.all(
      entries
        .filter(e => !isIgnoredName(e.name) && !isIgnoredExt(e.name))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })
        .map(async e => ({
          name:     e.name,
          path:     path.join(dirPath, e.name),
          isDir:    e.isDirectory(),
          children: e.isDirectory() ? [] : undefined,
        })),
    )
    return { name: path.basename(dirPath), path: dirPath, isDir: true, children }
  } catch { return null }
}

export async function expandDir(dirPath: string): Promise<any[]> {
  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter(e => !isIgnoredName(e.name) && !isIgnoredExt(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })
      .map(e => ({
        name:     e.name,
        path:     path.join(dirPath, e.name),
        isDir:    e.isDirectory(),
        children: e.isDirectory() ? [] : undefined,
      }))
  } catch { return [] }
}
