import { PermissionGuard } from '../PermissionGuard'
import type { ToolCall, ToolResult } from '../types'
import { ToolRegistry } from '../ToolRegistry'

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissionGuard: PermissionGuard,
  ) {}

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const decision = this.permissionGuard.check(toolCall)
    if (!decision.allowed) {
      throw new Error(decision.reason || 'Tool execution denied')
    }

    const tool = this.registry.get(toolCall.name)
    if (!tool) {
      throw new Error(`Tool not found: ${toolCall.name}`)
    }

    const result = await tool.execute(toolCall.arguments)

    return {
      name: toolCall.name,
      result,
    }
  }
}
