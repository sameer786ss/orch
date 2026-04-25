import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

let SQL: SqlJsStatic
let db: Database
let dbPath: string
let _persistTimer: ReturnType<typeof setTimeout> | null = null

// ── DB Init ──────────────────────────────────────────────────────
export async function getDb(): Promise<Database> {
  if (db) return db

  SQL = await initSqlJs({
    locateFile: (file: string) => {
      try {
        return require.resolve(`sql.js/dist/${file}`)
      } catch {
        return path.join(
          process.resourcesPath ?? __dirname,
          '..',
          'node_modules',
          'sql.js',
          'dist',
          file,
        )
      }
    },
  })

  dbPath = path.join(app.getPath('userData'), 'orch.db')
  const isNew = !fs.existsSync(dbPath)

  db = isNew ? new SQL.Database() : new SQL.Database(fs.readFileSync(dbPath))

  initSchema() // idempotent — CREATE TABLE IF NOT EXISTS
  if (isNew) persist() // only write to disk on first creation

  return db
}

// ── Persist ───────────────────────────────────────────────────────
/** Immediate flush — use for user-facing mutations (save conversation, delete, etc.) */
function persist() {
  if (!db || !dbPath) return
  const buf = db.export()
  fs.writeFileSync(dbPath, Buffer.from(buf))
}

/** Debounced flush — safe for high-frequency writes (embeddings, messages during stream) */
function persistDebounced(delayMs = 800) {
  if (_persistTimer) clearTimeout(_persistTimer)
  _persistTimer = setTimeout(() => {
    persist()
    _persistTimer = null
  }, delayMs)
}

// ── Schema ────────────────────────────────────────────────────────
function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT    PRIMARY KEY,
      title       TEXT    NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'idle',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id                TEXT    PRIMARY KEY,
      conversation_id   TEXT    NOT NULL,
      role              TEXT    NOT NULL,
      type              TEXT    NOT NULL DEFAULT 'text',
      content           TEXT    NOT NULL,
      tool_call_json    TEXT,
      file_diff_json    TEXT,
      timestamp         INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS indexed_files (
      id            TEXT    PRIMARY KEY,
      workspace     TEXT    NOT NULL,
      file_path     TEXT    NOT NULL,
      content_hash  TEXT    NOT NULL,
      indexed_at    INTEGER NOT NULL,
      UNIQUE(workspace, file_path)
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id              TEXT    PRIMARY KEY,
      file_id         TEXT    NOT NULL,
      chunk_index     INTEGER NOT NULL,
      chunk_text      TEXT    NOT NULL,
      embedding_json  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv  ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_embed_file     ON embeddings(file_id);
    CREATE INDEX IF NOT EXISTS idx_files_ws       ON indexed_files(workspace);
  `)
}

// ── Conversations ─────────────────────────────────────────────────
/** Returns conversations WITHOUT messages — messages are lazy-loaded separately */
export async function dbGetConversations() {
  const d = await getDb()
  const rows = d.exec(
    'SELECT id, title, status, created_at, updated_at FROM conversations ORDER BY updated_at DESC',
  )
  if (!rows.length) return []
  const cols = rows[0].columns
  return rows[0].values.map((row: any[]) => {
    const c: any = {}
    cols.forEach((col, i) => (c[col] = row[i]))
    c.createdAt = c.created_at
    c.updatedAt = c.updated_at
    c.messages = [] // filled lazily by dbGetMessages
    return c
  })
}

/** Lazy-load messages for a single conversation */
export async function dbGetMessages(conversationId: string) {
  const d = await getDb()
  return dbGetMessagesSync(d, conversationId)
}

function dbGetMessagesSync(d: Database, conversationId: string) {
  const rows = d.exec(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
    [conversationId],
  )
  if (!rows.length) return []
  const cols = rows[0].columns
  return rows[0].values.map((row: any[]) => {
    const m: any = {}
    cols.forEach((col, i) => (m[col] = row[i]))
    m.toolCall = m.tool_call_json ? JSON.parse(m.tool_call_json) : undefined
    m.fileDiff = m.file_diff_json ? JSON.parse(m.file_diff_json) : undefined
    return m
  })
}

export async function dbSaveConversation(conv: any) {
  const d = await getDb()
  d.run(
    `INSERT OR REPLACE INTO conversations (id, title, status, created_at, updated_at) VALUES (?,?,?,?,?)`,
    [conv.id, conv.title, conv.status, conv.createdAt, conv.updatedAt],
  )
  persist()
}

export async function dbDeleteConversation(id: string) {
  const d = await getDb()
  d.run('BEGIN TRANSACTION')
  try {
    d.run('DELETE FROM messages WHERE conversation_id = ?', [id])
    d.run('DELETE FROM conversations WHERE id = ?', [id])
    d.run('COMMIT')
  } catch (err) {
    d.run('ROLLBACK')
    throw err
  }
  persist()
}

export async function dbSaveMessage(conversationId: string, msg: any) {
  const d = await getDb()
  d.run(
    `INSERT OR REPLACE INTO messages
     (id, conversation_id, role, type, content, tool_call_json, file_diff_json, timestamp)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      msg.id,
      conversationId,
      msg.role,
      msg.type,
      msg.content,
      msg.toolCall ? JSON.stringify(msg.toolCall) : null,
      msg.fileDiff ? JSON.stringify(msg.fileDiff) : null,
      msg.timestamp,
    ],
  )
  persistDebounced() // safe for high-frequency streaming saves
}

// ── Vector Search ─────────────────────────────────────────────────
/** Batch-save all embedding chunks for a file inside a single transaction + one persist */
export async function dbSaveEmbeddingsBatch(
  fileId: string,
  chunks: Array<{ idx: number; text: string; emb: number[] }>,
) {
  const d = await getDb()
  d.run('BEGIN TRANSACTION')
  try {
    for (const { idx, text, emb } of chunks) {
      d.run(
        `INSERT OR REPLACE INTO embeddings (id, file_id, chunk_index, chunk_text, embedding_json)
         VALUES (?,?,?,?,?)`,
        [`${fileId}_${idx}`, fileId, idx, text, JSON.stringify(emb)],
      )
    }
    d.run('COMMIT')
  } catch (err) {
    d.run('ROLLBACK')
    throw err
  }
  persistDebounced() // one debounced flush per file
}

export async function dbSearchEmbeddings(
  queryEmbedding: number[],
  workspace: string,
  topK = 8,
) {
  const d = await getDb()
  const rows = d.exec(
    `SELECT e.chunk_text, e.embedding_json, f.file_path
     FROM embeddings e
     JOIN indexed_files f ON e.file_id = f.id
     WHERE f.workspace = ?`,
    [workspace],
  )
  if (!rows.length) return []

  const scored = rows[0].values
    .map((row: any[]) => ({
      chunkText: row[0] as string,
      embedding: JSON.parse(row[1] as string) as number[],
      filePath:  row[2] as string,
    }))
    .map(r => ({
      chunkText: r.chunkText,
      filePath:  r.filePath,
      score:     cosineSimilarity(queryEmbedding, r.embedding),
    }))

  return scored.sort((a, b) => b.score - a.score).slice(0, topK)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na  += a[i] ** 2
    nb  += b[i] ** 2
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9)
}

export async function dbSaveIndexedFile(
  id: string,
  workspace: string,
  filePath: string,
  hash: string,
) {
  const d = await getDb()
  d.run(
    `INSERT OR REPLACE INTO indexed_files (id, workspace, file_path, content_hash, indexed_at)
     VALUES (?,?,?,?,?)`,
    [id, workspace, filePath, hash, Date.now()],
  )
  persistDebounced()
}

export async function dbGetIndexedFile(workspace: string, filePath: string) {
  const d = await getDb()
  const rows = d.exec(
    'SELECT * FROM indexed_files WHERE workspace = ? AND file_path = ?',
    [workspace, filePath],
  )
  if (!rows.length || !rows[0].values.length) return null
  const cols = rows[0].columns
  const obj: any = {}
  cols.forEach((c, i) => (obj[c] = rows[0].values[0][i]))
  return obj
}
