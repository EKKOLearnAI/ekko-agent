export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string
  description: string
  execute: (args: TArgs) => Promise<TResult> | TResult
}

export interface BasicToolRegistrationOptions {
  workspaceRoot?: string
}

export type PermissionMode = 'confirm-dangerous' | 'full-access'

export interface ToolCall {
  name: string
  arguments: unknown
}

export interface ToolResult {
  name: string
  result: unknown
}

export interface Message {
  id?: string
  session_id?: string
  role: MessageRole
  content: string
  name?: string
  tool_calls?: ToolCall[]
  tool_result?: ToolResult
  created_at?: number
}

export interface MessageManager {
  listMessages(sessionId: string): Promise<Message[]>
  appendMessage(sessionId: string, message: Message): Promise<Message>
}

export interface AgentRunOptions {
  sessionId: string
}

export interface AgentStepResult {
  response?: string
  toolCall?: ToolCall
}

export interface AgentLoopModel {
  complete(input: {
    messages: Message[]
    tools: Array<Pick<ToolDefinition, 'name' | 'description'>>
  }): Promise<AgentStepResult>
}

export interface AgentLoopOptions {
  maxTurns?: number
  systemPrompt?: string
  permissionMode?: PermissionMode
  messageManager?: MessageManager
}

export interface AgentLoopRunResult {
  output: string
  messages: Message[]
  turns: number
}

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
  needsConfirmation?: boolean
}

export interface OpenAIModelAdapterOptions {
  apiKey?: string
  model: string
  baseURL?: string
  timeout?: number
}

export interface AgentCodeOptions extends AgentLoopOptions {
  dbPath?: string
}
