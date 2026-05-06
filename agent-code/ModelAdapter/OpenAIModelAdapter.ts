import OpenAI from 'openai'
import type { AgentLoopModel, AgentStepResult, Message, ToolDefinition } from '../types'

export interface OpenAIModelAdapterOptions {
  apiKey?: string
  model: string
  baseURL?: string
  timeout?: number
}

interface JsonStepResult {
  response?: string
  toolCall?: {
    name: string
    arguments: unknown
  }
}

function resolveApiKey(apiKey: string | undefined): string {
  const value = apiKey?.trim()
  if (!value) {
    throw new Error('OpenAI API key is required')
  }

  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0xff) {
      throw new Error(
        'OpenAI API key contains non-ASCII characters. Check OPENAI_API_KEY or apiKey input.',
      )
    }
  }

  return value
}

function serializeMessages(messages: Message[]): string {
  return messages
    .map(message => {
      const prefix = message.name ? `${message.role}:${message.name}` : message.role
      const parts = [prefix]

      if (message.content) {
        parts.push(message.content)
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        parts.push(`tool_calls=${JSON.stringify(message.tool_calls)}`)
      }

      return parts.join('\n')
    })
    .join('\n\n')
}

function serializeTools(tools: Array<Pick<ToolDefinition, 'name' | 'description'>>): string {
  if (tools.length === 0) return 'No tools available.'

  return tools
    .map(tool => `- ${tool.name}: ${tool.description}`)
    .join('\n')
}

function buildSystemInstruction(
  tools: Array<Pick<ToolDefinition, 'name' | 'description'>>,
): string {
  return [
    'You are an agent loop model.',
    'Return only valid JSON.',
    'You must return exactly one of these shapes:',
    '{"response":"final answer"}',
    '{"toolCall":{"name":"tool_name","arguments":{}}}',
    'Choose toolCall when a tool is needed before answering.',
    'Available tools:',
    serializeTools(tools),
  ].join('\n')
}

function parseStepResult(content: string): AgentStepResult {
  const parsed = JSON.parse(content) as JsonStepResult

  if (parsed.response && typeof parsed.response === 'string') {
    return { response: parsed.response }
  }

  if (
    parsed.toolCall &&
    typeof parsed.toolCall === 'object' &&
    typeof parsed.toolCall.name === 'string'
  ) {
    return {
      toolCall: {
        name: parsed.toolCall.name,
        arguments: parsed.toolCall.arguments ?? {},
      },
    }
  }

  throw new Error('OpenAIModelAdapter received invalid JSON step result')
}

export class OpenAIModelAdapter implements AgentLoopModel {
  private readonly client: OpenAI
  private readonly model: string
  private readonly timeout: number

  constructor(options: OpenAIModelAdapterOptions) {
    const apiKey = resolveApiKey(options.apiKey ?? process.env.OPENAI_API_KEY)

    this.client = new OpenAI({
      apiKey,
      baseURL: options.baseURL,
    })
    this.model = options.model
    this.timeout = options.timeout ?? 20_000
  }

  async complete(input: {
    messages: Message[]
    tools: Array<Pick<ToolDefinition, 'name' | 'description'>>
  }): Promise<AgentStepResult> {
    console.log(`[OpenAIModelAdapter] requesting model=${this.model}`)
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content: buildSystemInstruction(input.tools),
        },
        {
          role: 'user',
          content: serializeMessages(input.messages),
        },
      ],
    }, {
      timeout: this.timeout,
    })

    const content = response.output_text?.trim()
    if (!content) {
      throw new Error('OpenAIModelAdapter received empty response')
    }

    return parseStepResult(content)
  }
}
