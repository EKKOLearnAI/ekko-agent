import type { PermissionCheckResult, PermissionMode, ToolCall } from '../types'

const MUTATING_COMMAND_PATTERNS = [
  /\brm\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\btouch\b/i,
  /\bmkdir\b/i,
  /\brmdir\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bsed\s+-i\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\becho\b[\s\S]*>/i,
  /\bcat\b[\s\S]*>/i,
  />>/i,
  />\s*[^&]/i,
  /\bgit\s+reset\b/i,
  /\bgit\s+clean\b/i,
  /\bgit\s+checkout\b/i,
  /\bgit\s+restore\b/i,
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\b/i,
  /\bformat\b/i,
  /\bdel\s+\/s\b/i,
  /\brmdir\s+\/s\b/i,
  />\s*\/dev\//i,
]

function extractCommand(toolCall: ToolCall): string {
  if (!toolCall.arguments || typeof toolCall.arguments !== 'object') return ''

  const candidate = toolCall.arguments as { command?: unknown }
  if (typeof candidate.command !== 'string') return ''

  return candidate.command
}

function requiresConfirmation(command: string): boolean {
  return MUTATING_COMMAND_PATTERNS.some(pattern => pattern.test(command))
}

export class PermissionGuard {
  constructor(private readonly mode: PermissionMode = 'confirm-dangerous') {}

  check(toolCall: ToolCall): PermissionCheckResult {
    if (this.mode === 'full-access') {
      return { allowed: true }
    }

    if (toolCall.name !== 'run_command') {
      return { allowed: true }
    }

    const command = extractCommand(toolCall)
    if (!command) {
      return {
        allowed: false,
        reason: 'run_command requires a command string',
      }
    }

    if (!requiresConfirmation(command)) {
      return { allowed: true }
    }

    return {
      allowed: false,
      needsConfirmation: true,
      reason: `Mutating command requires confirmation: ${command}`,
    }
  }
}
