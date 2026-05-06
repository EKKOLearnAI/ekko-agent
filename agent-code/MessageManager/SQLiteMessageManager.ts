import { DatabaseSync } from 'node:sqlite'
import {
  AGENT_MESSAGES_INDEX,
  AGENT_MESSAGES_SCHEMA,
  AGENT_MESSAGES_TABLE,
  syncTableSchema,
} from '../../server/src/db/schemas'
import type { Message, MessageManager } from '../types'

function normalizeToolCalls(value: string | null): Message['tool_calls'] {
  if (!value) return undefined
  return JSON.parse(value) as Message['tool_calls']
}

function normalizeToolResult(value: string | null): Message['tool_result'] {
  if (!value) return undefined
  return JSON.parse(value) as Message['tool_result']
}

export class SQLiteMessageManager implements MessageManager {
  private readonly db: DatabaseSync

  constructor(private readonly dbPath: string) {
    this.db = new DatabaseSync(this.dbPath)
    this.init()
  }

  async listMessages(sessionId: string): Promise<Message[]> {
    const rows = this.db.prepare(
      `SELECT id, session_id, role, content, name, tool_calls, tool_result, created_at
       FROM ${AGENT_MESSAGES_TABLE}
       WHERE session_id = ?
       ORDER BY created_at ASC, id ASC`,
    ).all(sessionId) as Array<{
      id: string
      session_id: string
      role: Message['role']
      content: string
      name: string | null
      tool_calls: string | null
      tool_result: string | null
      created_at: number
    }>

    return rows.map(row => ({
      id: row.id,
      session_id: row.session_id,
      role: row.role,
      content: row.content,
      name: row.name ?? undefined,
      tool_calls: normalizeToolCalls(row.tool_calls),
      tool_result: normalizeToolResult(row.tool_result),
      created_at: row.created_at,
    }))
  }

  async appendMessage(sessionId: string, message: Message): Promise<Message> {
    const now = Date.now()
    const id = crypto.randomUUID()
    const toolCalls = message.tool_calls ? JSON.stringify(message.tool_calls) : null
    const toolResult = message.tool_result ? JSON.stringify(message.tool_result) : null

    this.db.prepare(
      `INSERT INTO ${AGENT_MESSAGES_TABLE}
       (id, session_id, role, content, name, tool_calls, tool_result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      sessionId,
      message.role,
      message.content,
      message.name ?? null,
      toolCalls,
      toolResult,
      now,
    )

    return {
      ...message,
      id,
      session_id: sessionId,
      created_at: now,
    }
  }

  private init(): void {
    syncTableSchema(this.db, AGENT_MESSAGES_TABLE, AGENT_MESSAGES_SCHEMA)
    this.db.exec(AGENT_MESSAGES_INDEX)
  }
}
