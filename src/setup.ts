import { EkkoDatabaseManager } from './database'
import {
  EkkoDirectoryManager,
  type EkkoDirectoryInitializationOptions,
  type EkkoDirectoryLayout,
  type EkkoSkillImportResult,
} from './directories'
import { MemoryService } from './memory/service'
import { resolveEkkoDatabasePath } from './memory/paths'
import { SqliteMemoryStore } from './memory/store'
import { EkkoToolApprovalService } from './tools/approval'
import { EkkoConfigStore } from './config-store'
import { EkkoConversationStore } from './conversations/store'
import {
  createConfiguredModelClient,
  modelRequestDefaultsFromConfig,
  resolveConfiguredModelProvider,
  type ResolveConfiguredModelProviderInput,
} from './model/provider-config'
import type { ModelClient, ModelClientOptions, ModelProviderConfig } from './model/types'
import { AgentRuntime } from './runtime/runtime'
import type { AgentRuntimeOptions } from './runtime/types'
import { createDefaultToolRegistry } from './tools/registry'
import { EkkoFileLogger } from './logging/file-logger'
import type { EkkoConfig } from './config'

export interface SetupEkkoAgentOptions extends EkkoDirectoryInitializationOptions {
  baseDirectory?: string
  profiles?: string[]
  env?: Record<string, string | undefined>
  packageRoot?: string
}

export interface EkkoProfileDirectoryLayout {
  profile: string
  skillDirectory: string
  logDirectory: string
  workspaceDirectory: string
}

export interface CreateEkkoRuntimeOptions extends AgentRuntimeOptions {
  profile?: string
  provider?: string
  model?: string
  apiKey?: string
  clientOptions?: ModelClientOptions
}

/**
 * Process-level Ekko resources created before any agent run.
 *
 * The setup owns its database connection and memory service. Profile agents
 * borrow these resources and must not close them independently.
 */
export class EkkoAgentSetup {
  readonly directories: EkkoDirectoryManager
  readonly layout: EkkoDirectoryLayout
  readonly config: EkkoConfigStore
  readonly database: EkkoDatabaseManager
  readonly memoryStore: SqliteMemoryStore
  readonly memory: MemoryService
  readonly conversations: EkkoConversationStore
  readonly skillImport?: EkkoSkillImportResult
  private readonly profileLayouts = new Map<string, EkkoProfileDirectoryLayout>()
  private currentToolApprovals: EkkoToolApprovalService
  private readonly unsubscribeConfig: () => void
  private closed = false

  constructor(options: SetupEkkoAgentOptions = {}) {
    this.directories = new EkkoDirectoryManager(options.baseDirectory)
    this.layout = {
      ...this.directories.initialize({
        hermesRootDirectory: options.hermesRootDirectory,
      }),
      databasePath: resolveEkkoDatabasePath({
        baseDirectory: options.baseDirectory,
        env: options.env,
        packageRoot: options.packageRoot,
      }),
    }
    this.skillImport = this.directories.lastSkillImport
    this.config = new EkkoConfigStore({ configPath: this.layout.configPath })
    const config = this.config.ensureDefaults()
    this.currentToolApprovals = this.createToolApprovals(config)
    this.unsubscribeConfig = this.config.onDidChange(nextConfig => {
      this.currentToolApprovals = this.createToolApprovals(nextConfig)
    })
    this.database = new EkkoDatabaseManager({
      databasePath: this.layout.databasePath,
      env: options.env,
    })

    try {
      this.memoryStore = new SqliteMemoryStore(this.database)
      this.memory = this.createMemoryService(config)
      this.conversations = new EkkoConversationStore(this.database)
    } catch (error) {
      this.database.close()
      throw error
    }

    const profiles = new Set([
      'default',
      ...(this.skillImport?.profiles ?? []),
      ...(options.profiles ?? []),
    ])
    for (const profile of profiles) this.ensureProfile(profile)
  }

  ensureProfile(profile = 'default'): EkkoProfileDirectoryLayout {
    const normalizedProfile = String(profile || '').trim() || 'default'
    const existing = this.profileLayouts.get(normalizedProfile)
    if (existing) return existing
    const layout = {
      profile: normalizedProfile,
      skillDirectory: this.directories.profileSkillsDirectory(normalizedProfile),
      logDirectory: this.directories.profileLogsDirectory(normalizedProfile),
      workspaceDirectory: this.directories.profileWorkspaceDirectory(normalizedProfile),
    }
    this.profileLayouts.set(normalizedProfile, layout)
    return layout
  }

  profile(profile = 'default'): EkkoProfileDirectoryLayout {
    const normalizedProfile = String(profile || '').trim() || 'default'
    const layout = this.profileLayouts.get(normalizedProfile)
    if (!layout) {
      throw new Error(`Ekko profile is not set up: ${normalizedProfile}`)
    }
    return layout
  }

  profiles(): EkkoProfileDirectoryLayout[] {
    return [...this.profileLayouts.values()]
  }

  get toolApprovals(): EkkoToolApprovalService {
    return this.currentToolApprovals
  }

  modelProviderConfig(
    input: Omit<ResolveConfiguredModelProviderInput, 'config'> = {},
  ): ModelProviderConfig {
    return resolveConfiguredModelProvider({
      ...input,
      config: this.config.read(),
    })
  }

  createModelClient(
    input: Omit<ResolveConfiguredModelProviderInput, 'config'> = {},
    clientOptions: ModelClientOptions = {},
  ): ModelClient {
    return createConfiguredModelClient({
      ...input,
      config: this.config.read(),
      clientOptions,
    })
  }

  createRuntime(options: CreateEkkoRuntimeOptions = {}): AgentRuntime {
    const {
      profile = 'default',
      provider,
      model,
      apiKey,
      clientOptions,
      ...runtimeOverrides
    } = options
    const config = this.config.read()
    const profileLayout = this.ensureProfile(profile)
    const toolsEnabled = runtimeOverrides.toolsEnabled ?? config.tools.enabled
    const skillsEnabled = runtimeOverrides.skillsEnabled ?? config.skills.enabled
    const skillDirectory = runtimeOverrides.skillDirectory ?? profileLayout.skillDirectory
    const toolAuthorizer = runtimeOverrides.toolAuthorizer ?? this.toolApprovals.authorize
    const modelClient = runtimeOverrides.modelClient ?? this.createModelClient(
      { provider, model, apiKey },
      clientOptions,
    )
    const tools = runtimeOverrides.tools ?? (toolsEnabled
      ? createDefaultToolRegistry({
          skillDirectory,
          authorizer: toolAuthorizer,
          executionTimeoutMs: config.tools.executionTimeoutMs,
          codeExec: {
            enabled: config.tools.codeExec.enabled,
            allowedLanguages: config.tools.codeExec.languages,
            timeoutMs: config.tools.codeExec.timeoutMs,
            maxToolCalls: config.tools.codeExec.maxToolCalls,
            maxOutputBytes: config.tools.codeExec.maxOutputBytes,
            maxStderrBytes: config.tools.codeExec.maxStderrBytes,
            maxSourceBytes: config.tools.codeExec.maxSourceBytes,
          },
        })
      : undefined)
    const modelDefaults = {
      ...modelRequestDefaultsFromConfig(config, provider),
      ...runtimeOverrides.modelDefaults,
      ...(model ? { model } : {}),
    }

    return new AgentRuntime({
      ...runtimeOverrides,
      modelClient,
      toolsEnabled,
      tools,
      toolAuthorizer,
      skillsEnabled,
      skillDirectory,
      skillReviewEveryToolCalls: runtimeOverrides.skillReviewEveryToolCalls
        ?? config.skills.reviewEveryToolCalls,
      runtimeInstructions: runtimeOverrides.runtimeInstructions ?? config.prompt.instructions,
      maxSteps: runtimeOverrides.maxSteps ?? config.runtime.maxSteps,
      maxModelRetries: runtimeOverrides.maxModelRetries ?? config.runtime.maxModelRetries,
      maxConsecutiveToolFailures: runtimeOverrides.maxConsecutiveToolFailures
        ?? config.runtime.maxConsecutiveToolFailures,
      backgroundDelegationEnabled: runtimeOverrides.backgroundDelegationEnabled
        ?? config.delegation.backgroundEnabled,
      subtaskMaxSteps: runtimeOverrides.subtaskMaxSteps ?? config.delegation.subtaskMaxSteps,
      modelDefaults,
      memory: runtimeOverrides.memory ?? (config.memory.enabled ? this.createMemoryService(config) : undefined),
      logWriter: runtimeOverrides.logWriter ?? new EkkoFileLogger({
        directory: profileLayout.logDirectory,
        maxBytes: config.logging.maxBytes,
      }),
      logProfile: runtimeOverrides.logProfile ?? profile,
    })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.unsubscribeConfig()
    this.memory.close()
  }

  private createToolApprovals(config: EkkoConfig): EkkoToolApprovalService {
    return new EkkoToolApprovalService({
      configPath: this.layout.configPath,
      enabled: config.tools.approvals.enabled,
      timeoutMs: config.tools.approvals.timeoutMs,
    })
  }

  private createMemoryService(config: EkkoConfig): MemoryService {
    return new MemoryService({
      store: this.memoryStore,
      enabled: config.memory.enabled,
      recentMessageLimit: config.memory.recentMessageLimit,
      automaticRecallTokenBudget: config.memory.automaticRecallTokenBudget,
      searchResultLimit: config.memory.searchResultLimit,
      reviewEveryUserMessages: config.memory.reviewEveryUserMessages,
    })
  }
}

export function setupEkkoAgent(options: SetupEkkoAgentOptions = {}): EkkoAgentSetup {
  return new EkkoAgentSetup(options)
}
