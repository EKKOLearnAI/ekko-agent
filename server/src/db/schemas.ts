import { DatabaseSync } from 'node:sqlite'
import { getDb } from './connection'

export const AGENT_MESSAGES_TABLE = 'agent_messages'

export const AGENT_MESSAGES_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  session_id: 'TEXT NOT NULL',
  role: 'TEXT NOT NULL',
  content: "TEXT NOT NULL DEFAULT ''",
  name: 'TEXT',
  tool_calls: 'TEXT',
  tool_result: 'TEXT',
  created_at: 'INTEGER NOT NULL',
}

export const AGENT_MESSAGES_INDEX =
  'CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id, created_at)'

export const AGENT_RUNS_TABLE = 'agent_runs'

export const AGENT_RUNS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  session_id: 'TEXT NOT NULL',
  model: "TEXT NOT NULL DEFAULT ''",
  provider: 'TEXT',
  status: "TEXT NOT NULL DEFAULT 'running'",
  message_count: 'INTEGER NOT NULL DEFAULT 0',
  tool_call_count: 'INTEGER NOT NULL DEFAULT 0',
  tool_result_count: 'INTEGER NOT NULL DEFAULT 0',
  input_tokens: 'INTEGER NOT NULL DEFAULT 0',
  output_tokens: 'INTEGER NOT NULL DEFAULT 0',
  reasoning_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_read_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_write_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_hit_tokens: 'INTEGER NOT NULL DEFAULT 0',
  total_tokens: 'INTEGER NOT NULL DEFAULT 0',
  estimated_cost_usd: 'REAL NOT NULL DEFAULT 0',
  actual_cost_usd: 'REAL',
  started_at: 'INTEGER NOT NULL',
  completed_at: 'INTEGER',
  duration_ms: 'INTEGER',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}

export const AGENT_RUNS_INDEX =
  'CREATE INDEX IF NOT EXISTS idx_agent_runs_session_id ON agent_runs(session_id, created_at)'

export const AGENT_MESSAGE_USAGE_TABLE = 'agent_message_usage'

export const AGENT_MESSAGE_USAGE_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  message_id: 'TEXT NOT NULL',
  session_id: 'TEXT NOT NULL',
  role: 'TEXT NOT NULL',
  model: "TEXT NOT NULL DEFAULT ''",
  provider: 'TEXT',
  input_tokens: 'INTEGER NOT NULL DEFAULT 0',
  output_tokens: 'INTEGER NOT NULL DEFAULT 0',
  reasoning_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_read_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_write_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_hit_tokens: 'INTEGER NOT NULL DEFAULT 0',
  total_tokens: 'INTEGER NOT NULL DEFAULT 0',
  estimated_cost_usd: 'REAL NOT NULL DEFAULT 0',
  actual_cost_usd: 'REAL',
  duration_ms: 'INTEGER',
  tool_call_count: 'INTEGER NOT NULL DEFAULT 0',
  tool_result_count: 'INTEGER NOT NULL DEFAULT 0',
  created_at: 'INTEGER NOT NULL',
}

export const AGENT_MESSAGE_USAGE_INDEX =
  'CREATE INDEX IF NOT EXISTS idx_agent_message_usage_session_id ON agent_message_usage(session_id, created_at)'

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function tableExists(db: DatabaseSync, tableName: string): boolean {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName)

  return !!result
}

function getExistingColumns(db: DatabaseSync, tableName: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string }>
  return new Set(rows.map(row => row.name))
}

export function createTableFromSchema(
  db: DatabaseSync,
  tableName: string,
  schema: Record<string, string>,
): void {

  const columns = Object.entries(schema)
    .map(([name, definition]) => `${quoteIdentifier(name)} ${definition}`)
    .join(', ')

  db.exec(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (${columns})`)
}

export function syncTableSchema(
  db: DatabaseSync,
  tableName: string,
  schema: Record<string, string>,
): void {

  if (!tableExists(db, tableName)) {
    createTableFromSchema(db, tableName, schema)
    return
  }

  const existingColumns = getExistingColumns(db, tableName)

  for (const [name, definition] of Object.entries(schema)) {
    if (existingColumns.has(name)) continue

    db.exec(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(name)} ${definition}`)
  }
}

export function initAllTables(): void {
  const db = getDb()
  syncTableSchema(db, AGENT_MESSAGES_TABLE, AGENT_MESSAGES_SCHEMA)
  db.exec(AGENT_MESSAGES_INDEX)
  syncTableSchema(db, AGENT_RUNS_TABLE, AGENT_RUNS_SCHEMA)
  db.exec(AGENT_RUNS_INDEX)
  syncTableSchema(db, AGENT_MESSAGE_USAGE_TABLE, AGENT_MESSAGE_USAGE_SCHEMA)
  db.exec(AGENT_MESSAGE_USAGE_INDEX)
}
