import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EKKO_CONFIG,
  EkkoConfigError,
  EkkoConfigStore,
  resolveConfiguredModelProvider,
  setupEkkoAgent,
} from '../src'

let baseDirectory = ''

beforeEach(async () => {
  baseDirectory = await mkdtemp(join(tmpdir(), 'ekko-config-'))
})

afterEach(async () => {
  await rm(baseDirectory, { recursive: true, force: true })
})

describe('EkkoConfigStore', () => {
  it('fills newly added leaves without replacing user values or unknown fields', async () => {
    const setup = setupEkkoAgent({ baseDirectory, env: { NODE_ENV: 'test' } })
    const configPath = setup.layout.configPath
    setup.close()
    await writeFile(configPath, JSON.stringify({
      schemaVersion: 1,
      runtime: { maxSteps: 17 },
      model: { reasoningEffort: 'high' },
      tools: { approvals: { permanentAllow: ['terminal:delete'] } },
      futureModule: { userOwned: true },
    }, null, 2))

    const config = new EkkoConfigStore({ configPath }).ensureDefaults()

    expect(config.runtime).toMatchObject({
      maxSteps: 17,
      maxModelRetries: DEFAULT_EKKO_CONFIG.runtime.maxModelRetries,
      maxConsecutiveToolFailures: DEFAULT_EKKO_CONFIG.runtime.maxConsecutiveToolFailures,
    })
    expect(config.model).toMatchObject({
      reasoningEffort: 'high',
      reasoningSummary: DEFAULT_EKKO_CONFIG.model.reasoningSummary,
      providers: {},
    })
    expect(config.tools.approvals.permanentAllow).toEqual(['terminal:delete'])
    expect(config).toHaveProperty('futureModule.userOwned', true)
    expect(config.schemaVersion).toBe(DEFAULT_EKKO_CONFIG.schemaVersion)

    const persisted = JSON.parse(await readFile(configPath, 'utf8'))
    expect(persisted.runtime.maxSteps).toBe(17)
    expect(persisted.runtime.maxModelRetries).toBe(DEFAULT_EKKO_CONFIG.runtime.maxModelRetries)
    expect(persisted.futureModule).toEqual({ userOwned: true })
  })

  it('patches nested leaves without replacing their sibling settings', () => {
    const setup = setupEkkoAgent({ baseDirectory, env: { NODE_ENV: 'test' } })
    try {
      setup.config.update({
        runtime: { maxSteps: 12 },
        model: { temperature: 0.4 },
      })
      const updated = setup.config.update({
        runtime: { maxModelRetries: 8 },
        model: { reasoningEffort: 'low' },
      })

      expect(updated.runtime).toMatchObject({ maxSteps: 12, maxModelRetries: 8 })
      expect(updated.model).toMatchObject({ temperature: 0.4, reasoningEffort: 'low' })
    } finally {
      setup.close()
    }
  })

  it('supports model provider CRUD with credentials in the same config object', () => {
    const setup = setupEkkoAgent({
      baseDirectory,
      env: { NODE_ENV: 'test' },
    })
    try {
      setup.config.setModelProvider('acme', {
        type: 'openai-compatible',
        requestStyle: 'openai-chat',
        baseUrl: 'https://models.example.test/v1',
        defaultModel: 'acme-large',
        apiKey: 'stored-secret',
      })
      setup.config.setDefaultModel('acme', 'acme-fast')

      expect(setup.config.listModelProviders()).toEqual([
        expect.objectContaining({ id: 'acme', isDefault: true }),
      ])
      expect(setup.config.getModelProvider('acme')).toMatchObject({
        defaultModel: 'acme-large',
        apiKey: 'stored-secret',
      })
      expect(setup.modelProviderConfig()).toMatchObject({
        id: 'acme',
        apiKey: 'stored-secret',
        defaultModel: 'acme-fast',
        timeoutMs: DEFAULT_EKKO_CONFIG.model.requestTimeoutMs,
      })

      setup.config.updateModelProvider('acme', { defaultModel: 'acme-v2' })
      expect(setup.config.getModelProvider('acme')?.defaultModel).toBe('acme-v2')
      expect(setup.config.deleteModelProvider('acme')).toBe(true)
      expect(setup.config.read().model).toMatchObject({ defaultProvider: '', defaultModel: '' })
      expect(setup.config.deleteModelProvider('acme')).toBe(false)
    } finally {
      setup.close()
    }
  })

  it('creates a configured model client through the setup facade', async () => {
    const setup = setupEkkoAgent({ baseDirectory, env: { NODE_ENV: 'test' } })
    try {
      setup.config.setModelProvider('local', {
        type: 'openai-compatible',
        requestStyle: 'openai-chat',
        baseUrl: 'http://127.0.0.1:11434/v1',
        defaultModel: 'local-model',
      })
      setup.config.setDefaultModel('local')
      const fetch = vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'configured' }, finish_reason: 'stop' }],
      })))

      const response = await setup.createModelClient({}, { fetch }).create({
        messages: [{ role: 'user', content: 'hello' }],
      })

      expect(response.content).toBe('configured')
      expect(fetch.mock.calls[0]?.[0]).toBe('http://127.0.0.1:11434/v1/chat/completions')
    } finally {
      setup.close()
    }
  })

  it('applies current config when creating a runtime and refreshes approval policy', async () => {
    const setup = setupEkkoAgent({ baseDirectory, env: { NODE_ENV: 'test' } })
    try {
      setup.config.update({
        runtime: { maxSteps: 7, maxModelRetries: 0 },
        model: {
          defaultModel: 'configured-model',
          temperature: 0.25,
          maxTokens: 321,
          reasoningEffort: 'high',
        },
        tools: { enabled: false, approvals: { enabled: false } },
        memory: { enabled: false },
        skills: { enabled: false },
        prompt: { instructions: ['Keep the configured instruction.'] },
      })

      await expect(setup.toolApprovals.authorize('terminal_exec', {
        command: 'rm',
        args: ['file.txt'],
      })).resolves.toMatchObject({ approved: true, scope: 'safe' })

      const create = vi.fn(async () => ({ content: 'done' }))
      const runtime = setup.createRuntime({
        modelClient: {
          provider: 'test',
          requestStyle: 'custom-runtime',
          capabilities: {
            streaming: false,
            tools: true,
            vision: false,
            jsonMode: false,
            systemPrompt: true,
          },
          create,
          stream: vi.fn(),
        },
      })
      await runtime.run({ messages: ['hello'] })

      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        model: 'configured-model',
        temperature: 0.25,
        maxTokens: 321,
        reasoningEffort: 'high',
        tools: undefined,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Keep the configured instruction.'),
          }),
        ]),
      }))
    } finally {
      setup.close()
    }
  })

  it('rejects malformed known fields and credential headers outside apiKey', () => {
    expect(() => resolveConfiguredModelProvider({
      config: {
        ...structuredClone(DEFAULT_EKKO_CONFIG),
        model: {
          ...structuredClone(DEFAULT_EKKO_CONFIG.model),
          defaultProvider: 'missing',
        },
      },
    })).toThrow('Configured model provider not found')

    const setup = setupEkkoAgent({ baseDirectory, env: { NODE_ENV: 'test' } })
    try {
      expect(() => setup.config.update({ runtime: { maxSteps: -1 } })).toThrow(EkkoConfigError)
      expect(() => setup.config.setModelProvider('unsafe', {
        type: 'openai-compatible',
        defaultModel: 'unsafe-model',
        headers: { Authorization: 'Bearer must-not-persist' },
      })).toThrow(/credential headers/)
    } finally {
      setup.close()
    }
  })
})
