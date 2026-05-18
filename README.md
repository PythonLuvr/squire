<p align="center">
  <img src="https://raw.githubusercontent.com/PythonLuvr/squire/main/assets/logo-transparent.png" alt="Squire logo" width="180">
</p>

<h1 align="center">Squire</h1>

<p align="center">
  Spawn Claude Code, Codex, and Gemini CLI from your Node app. Typed events, MCP forwarding, and permission setup included.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@pythonluvr/squire"><img src="https://img.shields.io/npm/v/@pythonluvr/squire.svg" alt="npm"></a>
  <a href="https://github.com/PythonLuvr/squire/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@pythonluvr/squire.svg" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+">
</p>

If you've spawned `claude`, `codex`, or `gemini` from a Node app, you know what you signed up for. Windows `.cmd` shim quirks. Hand-parsing stdout. Writing MCP config files to disk. Getting Claude Code to actually let your MCP tools through its permission gate. Then doing it all again the next time you add a CLI to the mix.

Squire is the runtime layer that handles that. Give it a binary and a prompt; you get back a typed event stream, MCP forwarding that works, and permission setup that doesn't need babysitting. Spawn one agent or bridge several from the same Node process. Cross-platform, zero runtime dependencies, MIT.

It's a tool, not a framework. Squire doesn't have opinions about how you structure your agent loop, what you log, or which CLI is "best." It hands you the primitives and stays out of the way.

```bash
npm install @pythonluvr/squire
```

```ts
import { Squire } from '@pythonluvr/squire'

const squire = new Squire({
  binary: 'claude',
  args: ['--permission-mode', 'bypassPermissions'],
  cwd: process.cwd(),
})

squire.on('stdout', (chunk) => process.stdout.write(chunk))
squire.on('event', (event) => {
  if (event.type === 'message_stop') console.log('\nexit code:', event.code)
})

await squire.start('Hello, agent.')
```

## What it does

- **Subprocess spawn.** Cross-platform `child_process` wrapper with Windows `.cmd` / `.bat` / extensionless-binary handling baked in. Works the same way on macOS and Linux.
- **Structured event streaming.** A typed `SquireEvent` union (`stdout`, `stderr`, `text_delta`, `message_start`, `message_stop`, `error`) replaces ad-hoc stdio parsing. v1.0 ships the built-in `text-stream` adapter; per-CLI parsers (Claude Code JSON streaming mode, Codex, Gemini CLI) land in v1.x.
- **MCP forwarding.** Pass `mcp.servers` or a pre-built `mcp.configPath` and Squire wires the child's `--mcp-config` flag for you. The temp config file is cleaned up on `stop()`.
- **Permission auto-setup.** For Claude Code, `autoSetup.claudeCode` merges `allowedTools` patterns into `~/.claude/settings.json` atomically (preserving everything else in the file). Idempotent.

## Supported CLIs

v1.0 is binary-agnostic. Any CLI that accepts a prompt on stdin and emits output on stdout will work with the built-in `text-stream` adapter.

| CLI | Notes |
| --- | --- |
| [Claude Code](https://docs.anthropic.com/claude/docs/claude-code) | `binary: 'claude'`. Pair with `autoSetup.claudeCode` for MCP-tool permissions. |
| [OpenAI Codex CLI](https://github.com/openai/codex) | `binary: 'codex'`. Honors `--mcp-config`. |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `binary: 'gemini'`. Honors `--mcp-config`. |
| Custom | Any binary on PATH or absolute path. |

A richer per-CLI event-extraction layer (`tool_call` / `tool_result` events from Claude Code's JSON streaming mode, equivalents for Codex and Gemini) is on the v1.x roadmap. The `SquireAdapter` interface is exported today so consumers can ship their own parsers.

## Cross-platform

| Platform | Status |
| --- | --- |
| Linux | First-class. |
| macOS | First-class. |
| Windows | First-class. Handles `.cmd` / `.bat` shims (needed for npm-installed CLIs) and PATHEXT walk for extensionless binaries via `shell: true` auto-detection. |

The Windows logic is in [`src/spawn.ts`](src/spawn.ts). It's deliberately scoped: `shell: true` only when the binary needs it, so paths containing spaces (the `C:\Program Files\...` case) keep working.

## API reference

### `new Squire(options: SquireOptions)`

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `binary` | `string` | required | Path or PATH-resolvable binary name. |
| `args` | `string[]` | `[]` | Default args prepended before per-call args. |
| `cwd` | `string` | `process.cwd()` | Working directory for the child. |
| `env` | `Record<string,string>` | `{}` | Merged on top of `process.env`. |
| `timeoutMs` | `number` | `600000` | Hard timeout per `start()`. `0` = unlimited. |
| `shell` | `boolean` | auto | Force shell mode; otherwise auto-detected per platform. |
| `mcp` | `SquireMcpOptions` | off | See "MCP forwarding" below. |
| `autoSetup` | `SquireAutoSetupOptions` | off | See "Permission auto-setup" below. |
| `adapter` | `string` | `'text-stream'` | Name of a registered `SquireAdapter`. |

### Lifecycle

- `start(prompt: string, opts?: { signal?: AbortSignal, extraArgs?: string[] }): Promise<void>`: spawn the child, pipe the prompt to stdin, stream events until exit. Resolves when the child closes (cleanly or otherwise).
- `send(followup: string): Promise<void>`: write more input to the child's stdin. Throws if the child is dead or stdin was closed.
- `stop({ graceful?: boolean }): Promise<void>`: SIGTERM then SIGKILL after 3 seconds (default); `{ graceful: false }` sends SIGKILL immediately.
- `pid: number | null`: child PID once spawned.

### Events

```ts
squire.on('stdout', (chunk: string) => { /* raw */ })
squire.on('stderr', (chunk: string) => { /* raw */ })
squire.on('event', (event: SquireEvent) => { /* discriminated union, see events.ts */ })
squire.on('exit', (code: number | null) => { /* terminal */ })
```

`SquireEvent` is a discriminated union; narrow on `event.type`. The v1.0 type union is documented in [`src/events.ts`](src/events.ts).

### Errors

All thrown errors are `SquireError` (or `SquireAutoSetupError` for permission-file failures). Narrow on `err.code`:

| Code | Meaning |
| --- | --- |
| `INVALID_OPTIONS` | Constructor or `registerSquireAdapter` rejected the input. |
| `ALREADY_STARTED` | `start()` called twice on the same instance. |
| `NOT_STARTED` | `send()` called before `start()`. |
| `SPAWN_FAILED` | Child failed to spawn (ENOENT, EACCES, etc). |
| `TIMEOUT` | `timeoutMs` exceeded. |
| `NON_ZERO_EXIT` | Child exited with a non-zero status code. |
| `ADAPTER_UNSUPPORTED_FEATURE` | Adapter or transport doesn't support the requested operation. |
| `ADAPTER_PARSE` | Adapter failed to parse the child's output (reserved for v1.x adapters). |
| `AUTOSETUP_READ` / `AUTOSETUP_PARSE` / `AUTOSETUP_WRITE` | Claude Code settings merge failed; see `.path`. |
| `MCP_CONFIG_WRITE` | Could not write the temp MCP config file. |

### MCP forwarding

```ts
new Squire({
  binary: 'claude',
  mcp: {
    servers: {
      myserver: { command: 'node', args: ['./mcp-server.js'] },
    },
    allowList: ['mcp__myserver__*'],
  },
})
```

If you already have an MCP config file, pass `mcp.configPath` instead and Squire will skip the temp-file write.

The flag defaults to `--mcp-config` (matches Claude Code, Codex, Gemini CLI). Override with `mcp.configFlag` for custom CLIs.

### Permission auto-setup

```ts
new Squire({
  binary: 'claude',
  mcp: { /* ... */ allowList: ['mcp__myserver__*'] },
  autoSetup: {
    claudeCode: { writeSettings: true },
  },
})
```

Claude Code treats external MCP tools as separate-trust by design. Without this step, the child halts at its own permission gate on the first MCP tool call. Squire merges the `allowList` patterns into `~/.claude/settings.json` atomically, preserving everything else in the file.

Falls back to `~/.claude/settings.json` by default; override with `autoSetup.claudeCode.settingsPath`.

### Custom adapters

```ts
import { registerSquireAdapter, type SquireAdapter } from '@pythonluvr/squire'

const myAdapter: SquireAdapter = {
  name: 'codex-json',
  create(ctx) {
    return {
      onStdout(chunk) { /* parse, return SquireEvent[] */ return [] },
      onStderr(chunk) { return [{ type: 'stderr', chunk }] },
    }
  },
}
registerSquireAdapter(myAdapter)

new Squire({ binary: 'codex', adapter: 'codex-json' })
```

## Example consumers

- **[OpenWar](https://github.com/PythonLuvr/openwar)** is a phase-gated agent runtime. It uses Squire under the hood for its `cli-bridge` adapter, layering a phase machine, deterministic detectors, and brief/trace persistence on top.

If you're using Squire in a project, send a PR adding a line here.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

PRs welcome. See [docs/contributing.md](docs/contributing.md) for the basics. The public API is frozen at v1.0.0: additive changes only on the v1.x line; breaking changes wait for v2.0.
