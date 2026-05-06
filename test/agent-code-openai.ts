import { AgentCode } from '../agent-code/index'

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

async function main(): Promise<void> {
  console.log('[test] booting agent-code-openai')
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini'
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined
  console.log(`[test] model=${model}`)
  console.log(`[test] baseURL=${baseURL ?? '(default)'}`)

  const agent = AgentCode.fromOpenAI({
    apiKey: getRequiredEnv('OPENAI_API_KEY'),
    baseURL,
    model,
    timeout: 20_000,
    agent: {
      dbPath: '.ekko-agent/agent.db',
      permissionMode: 'confirm-dangerous',
      systemPrompt: 'You are a coding agent. Use tools when needed.',
      maxTurns: 6,
    },
  })

  console.log('[test] running agent')
  const result = await agent.run(
    'List files in the current workspace, then answer with a short summary.',
    { sessionId: 'manual-test' },
  )

  console.log('OUTPUT:')
  console.log(result.output)
  console.log('\nTURNS:')
  console.log(result.turns)
  console.log('\nMESSAGES:')
  console.log(JSON.stringify(result.messages, null, 2))
}

main().catch(error => {
  console.error('[test] failed')
  console.error(error)
  process.exitCode = 1
})
