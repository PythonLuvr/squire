# Squire + OpenWar integration

OpenWar is the reference consumer for Squire. This doc walks through how OpenWar's `cli-bridge` adapter wraps Squire to layer phase machinery and trace persistence on top of subprocess spawning. Use it as a template for your own adapter / integration.

## The shape

```
OpenWar runner
    |
    v
OpenWar's CliBridgeAdapter (~80 lines)
    |   builds prompt from messages,
    |   constructs Squire,
    |   subscribes to events,
    |   translates SquireEvent -> StreamEvent
    v
Squire
    |   spawn, autoSetup, MCP, stdin pipe,
    |   adapter-driven event extraction
    v
child CLI (claude / codex / gemini / custom)
```

OpenWar owns:
- Brief format, frontmatter, `authorized_costs`.
- Phase machine (Phase 0 to Phase 4).
- Detectors and authorization gates.
- `trace.ndjson` and the `Tracer`.
- The bridged-CLI registry and per-CLI MCP config-file shape (e.g. Gemini's `.gemini/settings.json` vs. Claude Code's temp file).

Squire owns:
- `child_process.spawn` with cross-platform shell handling.
- The `--mcp-config` flag wiring (and `mcp.configPath` pass-through).
- Claude Code `settings.json` merging.
- The `SquireEvent` stream.

## Minimal adapter skeleton

```ts
import { Squire, type SquireEvent } from '@pythonluvr/squire'

export class MyBridgeAdapter {
  async *sendMessage(opts: SendMessageOptions): AsyncIterable<StreamEvent> {
    const prompt = serialize(opts.messages)
    const squire = new Squire({
      binary: this.binary,
      args: this.args,
      cwd: opts.workdir,
      env: opts.env,
      timeoutMs: this.timeoutMs,
      mcp: opts.mcpConfigPath ? { configPath: opts.mcpConfigPath } : undefined,
      autoSetup: opts.autoSetup,
    })

    const queue: SquireEvent[] = []
    let resolveNext: (() => void) | null = null
    squire.on('event', (e) => {
      queue.push(e)
      resolveNext?.()
      resolveNext = null
    })

    const exit = squire.start(prompt, { signal: opts.signal })

    while (true) {
      if (queue.length > 0) {
        const e = queue.shift()!
        if (e.type === 'text_delta') {
          yield { type: 'text_delta', delta: e.delta }
        } else if (e.type === 'message_stop') {
          yield { type: 'done', message: e.assembled }
          break
        } else if (e.type === 'error') {
          yield { type: 'error', error: e.error }
          break
        }
        continue
      }
      await Promise.race([
        exit,
        new Promise<void>((r) => { resolveNext = r }),
      ])
      if (queue.length === 0) break
    }
  }
}
```

## What stays in OpenWar (and your wrapper)

- **Brief auth checks.** Squire spawns whatever you give it; the gate that says "this brief is allowed to spawn a subprocess" belongs to the consumer.
- **MCP config-file generation.** Squire takes a `configPath` (or inline `servers`); building that path from your project memory, registry, or session state is your wrapper's job.
- **Logging / trace persistence.** Squire's events live in memory. Persisting them to NDJSON, replaying them, or rendering them in a dashboard belongs to the consumer.

## OpenWar's actual wrapper

See [`src/adapters/cli-bridge.ts`](https://github.com/PythonLuvr/openwar/blob/main/src/adapters/cli-bridge.ts) in OpenWar v0.11.0 and later. It's a working reference implementation of everything above.
