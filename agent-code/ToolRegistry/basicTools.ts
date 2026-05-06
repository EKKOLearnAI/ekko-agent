import { readdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import type { BasicToolRegistrationOptions, ToolDefinition } from '../types'

interface ReadFileArgs {
  path: string
}

interface ListFilesArgs {
  path?: string
}

interface RunCommandArgs {
  command: string
  cwd?: string
  timeoutMs?: number
}

function asReadFileArgs(args: unknown): ReadFileArgs {
  if (!args || typeof args !== 'object' || typeof (args as ReadFileArgs).path !== 'string') {
    throw new Error('read_file requires { path: string }')
  }

  return args as ReadFileArgs
}

function asListFilesArgs(args: unknown): ListFilesArgs {
  if (!args) return {}
  if (typeof args !== 'object') {
    throw new Error('list_files requires an object argument')
  }

  const candidate = args as ListFilesArgs
  if (candidate.path !== undefined && typeof candidate.path !== 'string') {
    throw new Error('list_files path must be a string')
  }

  return candidate
}

function asRunCommandArgs(args: unknown): RunCommandArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('run_command requires { command: string }')
  }

  const candidate = args as RunCommandArgs
  if (typeof candidate.command !== 'string' || candidate.command.trim() === '') {
    throw new Error('run_command requires a non-empty command string')
  }
  if (candidate.cwd !== undefined && typeof candidate.cwd !== 'string') {
    throw new Error('run_command cwd must be a string')
  }
  if (candidate.timeoutMs !== undefined && typeof candidate.timeoutMs !== 'number') {
    throw new Error('run_command timeoutMs must be a number')
  }

  return candidate
}

function resolveWorkspaceRoot(options: BasicToolRegistrationOptions): string {
  return options.workspaceRoot ?? process.cwd()
}

function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  return path.resolve(workspaceRoot, targetPath)
}

function resolveShellCommand(command: string): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', command],
    }
  }

  return {
    file: process.env.SHELL || '/bin/sh',
    args: ['-lc', command],
  }
}

async function runShellCommand(
  workspaceRoot: string,
  args: RunCommandArgs,
): Promise<{
  stdout: string
  stderr: string
  exitCode: number | null
  cwd: string
}> {
  const cwd = resolveWorkspacePath(workspaceRoot, args.cwd ?? '.')
  const shell = resolveShellCommand(args.command)

  return new Promise((resolveResult, reject) => {
    const child = spawn(shell.file, shell.args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timeoutMs = args.timeoutMs ?? 60_000
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`run_command timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })

    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })

    child.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', exitCode => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveResult({
        stdout,
        stderr,
        exitCode,
        cwd,
      })
    })
  })
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}

export function createBasicTools(
  options: BasicToolRegistrationOptions = {},
): ToolDefinition[] {
  const workspaceRoot = resolveWorkspaceRoot(options)

  return [
    {
      name: 'read_file',
      description: 'Read a UTF-8 text file from the current workspace',
      async execute(args: unknown): Promise<{
        ok: boolean
        path: string
        content?: string
        reason?: 'not_found'
      }> {
        const safeArgs = asReadFileArgs(args)
        const filePath = resolveWorkspacePath(workspaceRoot, safeArgs.path)
        try {
          const content = await readFile(filePath, 'utf8')
          return {
            ok: true,
            path: filePath,
            content,
          }
        } catch (error) {
          if (isNotFoundError(error)) {
            return {
              ok: false,
              path: filePath,
              reason: 'not_found',
            }
          }

          throw error
        }
      },
    },
    {
      name: 'list_files',
      description: 'List files in a directory from the current workspace',
      async execute(args: unknown): Promise<{
        ok: boolean
        path: string
        entries?: string[]
        reason?: 'not_found'
      }> {
        const safeArgs = asListFilesArgs(args)
        const dirPath = resolveWorkspacePath(workspaceRoot, safeArgs.path ?? '.')
        try {
          const entries = await readdir(dirPath, { withFileTypes: true })

          return {
            ok: true,
            path: dirPath,
            entries: entries.map(entry => {
              if (entry.isDirectory()) return `${entry.name}/`
              return entry.name
            }),
          }
        } catch (error) {
          if (isNotFoundError(error)) {
            return {
              ok: false,
              path: dirPath,
              reason: 'not_found',
            }
          }

          throw error
        }
      },
    },
    {
      name: 'get_current_time',
      description: 'Get the current local time and timezone information',
      execute(): { iso: string; timezone: string } {
        const now = new Date()

        return {
          iso: now.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      },
    },
    {
      name: 'get_platform_info',
      description: 'Get current operating system and path separator information',
      execute(): {
        platform: NodeJS.Platform
        arch: string
        homedir: string
        tmpdir: string
        pathSeparator: string
        workspaceRoot: string
      } {
        return {
          platform: process.platform,
          arch: process.arch,
          homedir: os.homedir(),
          tmpdir: os.tmpdir(),
          pathSeparator: path.sep,
          workspaceRoot,
        }
      },
    },
    {
      name: 'run_command',
      description: 'Run a shell command in the current workspace',
      async execute(args: unknown): Promise<{
        stdout: string
        stderr: string
        exitCode: number | null
        cwd: string
      }> {
        const safeArgs = asRunCommandArgs(args)
        return runShellCommand(workspaceRoot, safeArgs)
      },
    },
  ]
}
