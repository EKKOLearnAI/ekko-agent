import type { ToolDefinition } from '../types'
import { createBasicTools } from './basicTools'
import type { BasicToolRegistrationOptions } from '../types'

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  registerBasicTools(options: BasicToolRegistrationOptions = {}): void {
    for (const tool of createBasicTools(options)) {
      this.register(tool)
    }
  }
}

export { createBasicTools } from './basicTools'
