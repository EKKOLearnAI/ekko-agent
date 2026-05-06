import { PermissionGuard } from '../PermissionGuard'
import { ToolExecutor } from '../ToolExecutor'
import { ToolRegistry } from '../ToolRegistry'
import type {
  BasicToolRegistrationOptions,
  AgentLoopModel,
  AgentLoopOptions,
  AgentLoopRunResult,
  AgentRunOptions,
  Message,
  ToolDefinition,
} from '../types'

const DEFAULT_MAX_TURNS = 8

export class AgentLoop {
  private readonly registry = new ToolRegistry()
  private readonly permissionGuard: PermissionGuard
  private readonly executor: ToolExecutor
  private readonly maxTurns: number
  private readonly systemPrompt?: string
  private readonly messageManager?: AgentLoopOptions['messageManager']

  constructor(
    private readonly model: AgentLoopModel,
    options: AgentLoopOptions = {},
  ) {
    this.permissionGuard = new PermissionGuard(options.permissionMode)
    this.executor = new ToolExecutor(this.registry, this.permissionGuard)
    this.maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS
    this.systemPrompt = options.systemPrompt
    this.messageManager = options.messageManager
  }

  registerTool(tool: ToolDefinition): void {
    this.registry.register(tool)
  }

  registerBasicTools(options: BasicToolRegistrationOptions = {}): void {
    this.registry.registerBasicTools(options)
  }

  async run(input: string, options: AgentRunOptions): Promise<AgentLoopRunResult> {
    const messages = await this.loadMessages(options.sessionId)

    const userMessage = await this.appendMessage(options.sessionId, {
      role: 'user',
      content: input,
    })
    messages.push(userMessage)

    for (let turn = 1; turn <= this.maxTurns; turn += 1) {
      const step = await this.model.complete({
        messages: this.buildModelMessages(messages),
        tools: this.registry.list().map(tool => ({
          name: tool.name,
          description: tool.description,
        })),
      })

      if (step.response) {
        const assistantMessage = await this.appendMessage(options.sessionId, {
          role: 'assistant',
          content: step.response,
        })
        messages.push(assistantMessage)

        return {
          output: step.response,
          messages,
          turns: turn,
        }
      }

      if (!step.toolCall) {
        throw new Error('Model returned neither response nor tool call')
      }

      const toolCallMessage = await this.appendMessage(options.sessionId, {
        role: 'assistant',
        content: '',
        tool_calls: [step.toolCall],
      })
      messages.push(toolCallMessage)

      const toolResult = await this.executor.execute(step.toolCall)

      const toolResultMessage = await this.appendMessage(options.sessionId, {
        role: 'tool',
        name: toolResult.name,
        content: JSON.stringify(toolResult.result),
        tool_result: toolResult,
      })
      messages.push(toolResultMessage)
    }

    throw new Error(`Agent loop exceeded max turns: ${this.maxTurns}`)
  }

  private async loadMessages(sessionId: string): Promise<Message[]> {
    if (!this.messageManager) {
      return []
    }

    return this.messageManager.listMessages(sessionId)
  }

  private async appendMessage(sessionId: string, message: Message): Promise<Message> {
    if (!this.messageManager) {
      return message
    }

    return this.messageManager.appendMessage(sessionId, message)
  }

  private buildModelMessages(messages: Message[]): Message[] {
    if (!this.systemPrompt) {
      return messages
    }

    return [
      {
        role: 'system',
        content: this.systemPrompt,
      },
      ...messages,
    ]
  }
}
