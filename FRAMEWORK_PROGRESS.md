# Agent Progress

## Completed

### AgentLoop

- `AgentLoop` exists as the core loop entry.
- The loop runs turn by turn with a `maxTurns` limit.
- The model adapter is called every turn with the current messages and tool metadata.
- Tool calls are executed through `ToolExecutor`.
- Permission checks are wired in through `PermissionGuard`.
- `AgentCode` exposes a class-based entry and can build from OpenAI.
- `run()` now accepts a `sessionId` so it can load and append persisted messages.

### Message

- `Message` now supports structured fields instead of plain text only.
- `assistant` messages can carry `tool_calls`.
- `tool` messages can carry `tool_result`.
- Messages can be loaded from and appended to SQLite through `MessageManager`.
- Message storage is persisted through `SQLiteMessageManager`.
- Missing file reads and directory reads return structured `ok: false` results instead of throwing immediately.

## Not Completed

### AgentLoop

- No real confirmation continuation flow yet.
- `confirm-dangerous` still stops execution instead of pausing and waiting for confirmation.
- No dedicated `ToolCall` and `ToolResult` event stream is emitted.
- No structured run trace or step trace is stored yet.
- `run_command` is still too generic for destructive operations.

### Message

- Message usage is not yet written on each turn.
- Token counts are not yet persisted per message.
- Cache hit / read / write counts are not yet written per message.
- Duration per message is not yet written.
- Run-level usage aggregation is not yet wired.
- No dedicated message usage store exists yet.

## Current Risks

- The loop can still hallucinate a successful destructive action if the command prints a success string.
- There is no true resume-after-confirmation path.
- Tool call arguments are stored structurally in messages, but not yet in a dedicated execution record.
- Message and usage schemas still need a final pass once run traces are added.

## Next Steps

1. Add a confirmation state to `AgentLoop`.
2. Add a `MessageUsageStore` for token / cache / duration metrics.
3. Add a run trace record for each tool call and result.
4. Split destructive file work out of `run_command` into dedicated tools.
