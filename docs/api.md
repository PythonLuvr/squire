# Squire API reference

This is the canonical reference for the v1.0 public surface. Everything in [`src/index.ts`](../src/index.ts) is exported; anything outside that file is internal and may change between patch versions.

## `Squire`

The main class. One instance manages one child-process lifecycle.

```ts
import { Squire } from '@pythonluvr/squire'

const squire = new Squire({
  binary: 'claude',
  args: ['--permission-mode', 'bypassPermissions'],
})
```

### Methods

#### `start(prompt: string, opts?: SquireStartOptions): Promise<void>`

Spawns the child, runs optional auto-setup and MCP preflight, pipes `prompt` to stdin, and streams events until exit. Resolves when the child closes (cleanly or otherwise).

Throws synchronously only on `INVALID_OPTIONS` or `ALREADY_STARTED`. All other failures (spawn, timeout, non-zero exit) surface as `error` events on the stream and resolve the promise normally.

`SquireStartOptions`:
- `signal?: AbortSignal`: forward an abort signal to the child (SIGTERM on abort).
- `extraArgs?: string[]`: per-call argv tail appended after `options.args` and any Squire-injected args (e.g. `--mcp-config`).

#### `send(followup: string): Promise<void>`

Writes `followup` to the child's stdin. Throws `NOT_STARTED` if called before `start()`, or `ADAPTER_UNSUPPORTED_FEATURE` if the child's stdin is closed (most CLIs do this after consuming the initial prompt).

#### `stop(opts?: SquireStopOptions): Promise<void>`

Terminates the child.
- `{ graceful: true }` (default): SIGTERM, then SIGKILL after 3 seconds if still running.
- `{ graceful: false }`: immediate SIGKILL.

Safe to call multiple times.

#### `pid: number | null`

The child PID once spawned, or null.

### Events

`Squire` extends `EventEmitter`. Listeners:

```ts
squire.on('stdout', (chunk: string) => { /* raw */ })
squire.on('stderr', (chunk: string) => { /* raw */ })
squire.on('event', (event: SquireEvent) => { /* semantic union */ })
squire.on('exit', (code: number | null) => { /* lifecycle terminal */ })
```

## `SquireEvent`

Discriminated union. Narrow on `type`:

```ts
type SquireEvent =
  | { type: 'stdout'; chunk: string }
  | { type: 'stderr'; chunk: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'message_start'; pid: number }
  | { type: 'message_stop'; code: number | null; signal: NodeJS.Signals | null; assembled: string }
  | { type: 'error'; error: Error; reason?: 'spawn'|'timeout'|'exit'|'adapter'|'aborted'; stderrTail?: string }
```

`text_delta` is emitted by the configured adapter. For the built-in `text-stream` adapter it duplicates `stdout`. For per-CLI adapters (v1.x), `text_delta` is the assistant-visible text only and tool I/O is routed through other variants (reserved for v1.x).

## `SquireOptions`

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `binary` | `string` | required | Path or PATH-resolvable binary. |
| `args` | `string[]` | `[]` | Default args. |
| `cwd` | `string` | `process.cwd()` | Working directory. |
| `env` | `Record<string,string>` | `{}` | Merged on top of `process.env`. |
| `timeoutMs` | `number` | `600000` | `0` = unlimited. |
| `shell` | `boolean` | auto | Force shell mode; otherwise per-platform auto-detect. |
| `mcp` | `SquireMcpOptions` | off | MCP forwarding. |
| `autoSetup` | `SquireAutoSetupOptions` | off | Permission preflight. |
| `adapter` | `string` | `'text-stream'` | Registered adapter name. |

### `SquireMcpOptions`

```ts
{
  configPath?: string;                          // pre-built config file
  servers?: Record<string, SquireMcpServerConfig>;  // inline (Squire writes temp file)
  configFlag?: string;                          // default '--mcp-config'
  allowList?: string[];                         // for autoSetup.claudeCode
  cleanupOnStop?: boolean;                      // default true for temp files
}
```

### `SquireAutoSetupOptions`

```ts
{
  claudeCode?: {
    writeSettings?: boolean;                    // default true (when claudeCode is set)
    allowedTools?: string[];                    // falls back to mcp.allowList
    settingsPath?: string;                      // default ~/.claude/settings.json
  }
}
```

## Errors

All thrown errors are instances of `SquireError`. Narrow on `err.code`:

| Code | Trigger |
| --- | --- |
| `INVALID_OPTIONS` | Bad constructor input or adapter name. |
| `ALREADY_STARTED` | Second `start()` on the same instance. |
| `NOT_STARTED` | `send()` before `start()`. |
| `SPAWN_FAILED` | ENOENT / EACCES, signaled via `error` event. |
| `TIMEOUT` | `timeoutMs` exceeded. |
| `NON_ZERO_EXIT` | Child exited non-zero (also `error` event). |
| `ADAPTER_UNSUPPORTED_FEATURE` | `send()` after stdin closed, etc. |
| `ADAPTER_PARSE` | Reserved for v1.x adapters. |
| `AUTOSETUP_READ` / `AUTOSETUP_PARSE` / `AUTOSETUP_WRITE` | Claude Code settings merge failed. `SquireAutoSetupError` carries `.path`. |
| `MCP_CONFIG_WRITE` | Could not write temp MCP config. |

## Custom adapters

```ts
import { registerSquireAdapter, type SquireAdapter } from '@pythonluvr/squire'

const codexJson: SquireAdapter = {
  name: 'codex-json',
  create(ctx) {
    let buf = ''
    return {
      onStdout(chunk) {
        buf += chunk
        const out = []
        // parse buf, push SquireEvent values, drop consumed bytes
        return out
      },
      onStderr(chunk) { return [{ type: 'stderr', chunk }] },
      onClose() { return [] },
    }
  },
}
registerSquireAdapter(codexJson)

const squire = new Squire({ binary: 'codex', adapter: 'codex-json' })
```

Adapter registration is process-global and last-write-wins by name. The built-in `text-stream` adapter is always registered.

## Cross-platform notes

`needsShell(binary, platform?)` is exported for callers that want to share Squire's auto-detection logic. The current rules:

- POSIX (`linux`, `darwin`, etc.): always `false`.
- Windows (`win32`):
  - `.cmd` / `.bat` -> `true` (Node cannot spawn these without a shell).
  - No file extension -> `true` (PATHEXT walk via `cmd.exe`).
  - `.exe` / `.com` / other -> `false` (CreateProcess handles them; preserves path-with-spaces).
