import { AgentLoop } from './AgentLoop'
import { SQLiteMessageManager } from './MessageManager'
import { OpenAIModelAdapter } from './ModelAdapter'
import type {
  AgentCodeOptions,
  AgentLoopModel,
  AgentRunOptions,
  AgentLoopRunResult,
  BasicToolRegistrationOptions,
  OpenAIModelAdapterOptions,
  ToolDefinition,
} from './types'

export class AgentCode {
  private readonly loop: AgentLoop

  constructor(model: AgentLoopModel, options: AgentCodeOptions = {}) {
    const messageManager = options.dbPath
      ? new SQLiteMessageManager(options.dbPath)
      : options.messageManager

    this.loop = new AgentLoop(model, {
      ...options,
      messageManager,
    })
    this.loop.registerBasicTools()
  }

  registerTool(tool: ToolDefinition): void {
    this.loop.registerTool(tool)
  }

  registerBasicTools(options: BasicToolRegistrationOptions = {}): void {
    this.loop.registerBasicTools(options)
  }

  run(input: string, options: AgentRunOptions): Promise<AgentLoopRunResult> {
    return this.loop.run(input, options)
  }

  static fromOpenAI(
    options: OpenAIModelAdapterOptions & {
      agent?: AgentCodeOptions
    },
  ): AgentCode {
    const model = new OpenAIModelAdapter(options)
    return new AgentCode(model, options.agent)
  }
}

export { AgentLoop } from './AgentLoop'
export { SQLiteMessageManager } from './MessageManager'
export { OpenAIModelAdapter } from './ModelAdapter'
export { PermissionGuard } from './PermissionGuard'
export { ToolExecutor } from './ToolExecutor'
export { ToolRegistry } from './ToolRegistry'
export type {
  AgentCodeOptions,
  AgentRunOptions,
  BasicToolRegistrationOptions,
  AgentStepResult,
  Message,
  MessageManager,
  PermissionCheckResult,
  PermissionMode,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from './types'
