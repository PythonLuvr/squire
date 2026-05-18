// Squire's main class. Wraps a child CLI subprocess, runs optional MCP and
// auto-setup preflight, and emits a discriminated event stream.
//
// Lifecycle:
//   new Squire(options) -> start(prompt) -> ...events... -> exit
//                                        -> stop({graceful})
//
// Events:
//   "stdout"  string  raw stdout chunk
//   "stderr"  string  raw stderr chunk
//   "event"   SquireEvent  semantic event from the configured adapter
//   "exit"    code: number|null  lifecycle terminal
//
// A single Squire instance runs one lifecycle. Calling start() twice throws
// ALREADY_STARTED.

import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { squireSpawn } from "./spawn.js";
import { getSquireAdapter } from "./adapters/registry.js";
import type { SquireAdapter, SquireAdapterInstance } from "./adapters/types.js";
import type { SquireEvent } from "./events.js";
import type { SquireOptions } from "./options.js";
import { SquireError } from "./errors.js";
import { setupMcpForwarding, cleanupMcpForwarding, type McpForwardSetup } from "./mcp/forwarder.js";
import {
  defaultClaudeSettingsPath,
  expandHome,
  mergeClaudeSettings,
} from "./autosetup/claude-code-settings.js";

const DEFAULT_TIMEOUT_MS = 600_000;
const GRACEFUL_STOP_TIMEOUT_MS = 3_000;

export interface SquireStopOptions {
  /** When true (default), SIGTERM then SIGKILL after 3s. When false, immediate SIGKILL. */
  graceful?: boolean;
}

export interface SquireStartOptions {
  /** Optional AbortSignal to forward into the child (SIGTERM on abort). */
  signal?: AbortSignal;
  /** Per-call args appended after `options.args`. */
  extraArgs?: string[];
}

export class Squire extends EventEmitter {
  private readonly options: SquireOptions;
  private readonly adapter: SquireAdapter;
  private adapterInstance: SquireAdapterInstance | null = null;
  private child: ChildProcess | null = null;
  private started = false;
  private mcpSetup: McpForwardSetup | null = null;
  private assembled = "";
  private stderrBuf = "";
  private timeoutHandle: NodeJS.Timeout | null = null;
  private timedOut = false;
  private aborted = false;
  private stopped = false;

  constructor(options: SquireOptions) {
    super();
    if (!options || typeof options.binary !== "string" || options.binary.length === 0) {
      throw new SquireError("INVALID_OPTIONS", 'Squire: "binary" is required');
    }
    this.options = options;
    this.adapter = getSquireAdapter(options.adapter ?? "text-stream");
  }

  /** Spawn the child CLI with `prompt` written to stdin. Resolves when the
   *  child exits (cleanly or otherwise). Throws on hard errors. */
  async start(prompt: string, opts: SquireStartOptions = {}): Promise<void> {
    if (this.started) {
      throw new SquireError("ALREADY_STARTED", "Squire.start() called twice on the same instance");
    }
    this.started = true;

    // Phase: auto-setup. Errors here halt before spawn.
    await this.runAutoSetup();

    // Phase: MCP. Materialize config file (if inline).
    this.mcpSetup = await setupMcpForwarding(this.options.mcp);

    const args = [
      ...(this.options.args ?? []),
      ...(this.mcpSetup?.extraArgs ?? []),
      ...(opts.extraArgs ?? []),
    ];
    const env = { ...process.env, ...(this.options.env ?? {}) };

    let child: ChildProcess;
    try {
      child = squireSpawn({
        binary: this.options.binary,
        args,
        cwd: this.options.cwd,
        env,
        shell: this.options.shell,
      });
    } catch (err) {
      await this.cleanup();
      throw new SquireError(
        "SPAWN_FAILED",
        `Squire: spawn(${this.options.binary}) threw synchronously: ${(err as Error).message}`,
        { cause: err },
      );
    }
    this.child = child;
    this.adapterInstance = this.adapter.create({ binary: this.options.binary, args });

    // Timeout
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (timeoutMs > 0) {
      this.timeoutHandle = setTimeout(() => {
        this.timedOut = true;
        try { child.kill("SIGTERM"); } catch { /* already dead */ }
        setTimeout(() => {
          if (!child.killed) {
            try { child.kill("SIGKILL"); } catch { /* already dead */ }
          }
        }, 5_000).unref();
      }, timeoutMs);
      this.timeoutHandle.unref();
    }

    // Abort signal pass-through
    if (opts.signal) {
      const onAbort = (): void => {
        this.aborted = true;
        try { child.kill("SIGTERM"); } catch { /* already dead */ }
      };
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    // Pipe stdin
    try {
      child.stdin?.write(prompt);
      child.stdin?.end();
    } catch {
      // EPIPE if child died before consuming stdin. Surfaces via exit handler.
    }

    if (typeof child.pid === "number") {
      this.dispatch({ type: "message_start", pid: child.pid });
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.assembled += text;
      this.emit("stdout", text);
      const events = this.adapterInstance?.onStdout(text) ?? [];
      for (const e of events) this.emit("event", e);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.stderrBuf += text;
      this.emit("stderr", text);
      const events = this.adapterInstance?.onStderr(text) ?? [];
      for (const e of events) this.emit("event", e);
    });

    // Register the close handler eagerly so we capture the close event even
    // if it fires before downstream awaits attach. The spawn-error race below
    // piggybacks on `closePromise` so we never miss the close.
    const closePromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("close", (code, signal) => resolve({ code, signal }));
    });

    // Spawn-time error (ENOENT, EACCES). Races against close to short-circuit
    // when no error fires.
    const spawnError = await new Promise<Error | null>((resolve) => {
      child.once("error", (err) => resolve(err));
      closePromise.then(() => resolve(null));
    });
    if (spawnError) {
      this.dispatch({
        type: "error",
        error: new SquireError("SPAWN_FAILED", `Squire(${this.options.binary}): ${spawnError.message}`, { cause: spawnError }),
        reason: "spawn",
      });
      this.emit("exit", null);
      await this.cleanup();
      return;
    }

    const { code, signal } = await closePromise;

    // Flush adapter on close.
    const closeEvents = this.adapterInstance?.onClose?.(code, signal) ?? [];
    for (const e of closeEvents) this.emit("event", e);

    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);

    if (this.timedOut) {
      this.dispatch({
        type: "error",
        error: new SquireError("TIMEOUT", `Squire(${this.options.binary}): timed out after ${timeoutMs}ms`),
        reason: "timeout",
      });
    } else if (this.aborted) {
      this.dispatch({
        type: "error",
        error: new SquireError("SPAWN_FAILED", `Squire(${this.options.binary}): aborted by caller signal`),
        reason: "aborted",
      });
    } else if (code !== 0 && code !== null) {
      const tail = this.stderrBuf.trim().slice(-2000);
      this.dispatch({
        type: "error",
        error: new SquireError(
          "NON_ZERO_EXIT",
          `Squire(${this.options.binary}): exit code ${code}${signal ? ` signal=${signal}` : ""}` +
            (tail ? `\nstderr: ${tail}` : ""),
        ),
        reason: "exit",
        stderrTail: tail || undefined,
      });
    } else {
      this.dispatch({
        type: "message_stop",
        code,
        signal,
        assembled: this.assembled,
      });
    }

    this.emit("exit", code);
    await this.cleanup();
  }

  /** Write a follow-up message to the child's stdin. Throws when the child
   *  has already exited or stdin has been closed. Not all CLIs accept stdin
   *  after the initial prompt; callers should know their target CLI. */
  async send(followup: string): Promise<void> {
    if (!this.child) {
      throw new SquireError("NOT_STARTED", "Squire.send() called before start()");
    }
    const stdin = this.child.stdin;
    if (!stdin || stdin.destroyed || stdin.writableEnded) {
      throw new SquireError(
        "ADAPTER_UNSUPPORTED_FEATURE",
        `Squire(${this.options.binary}): child stdin is closed; this CLI does not accept follow-up input.`,
      );
    }
    await new Promise<void>((resolve, reject) => {
      stdin.write(followup, (err) => (err ? reject(err) : resolve()));
    });
  }

  /** Terminate the child. SIGTERM then SIGKILL after 3s grace by default. */
  async stop(opts: SquireStopOptions = {}): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const child = this.child;
    if (!child || child.killed || child.exitCode !== null) {
      await this.cleanup();
      return;
    }
    const graceful = opts.graceful !== false;
    if (graceful) {
      try { child.kill("SIGTERM"); } catch { /* already dead */ }
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          if (!child.killed) {
            try { child.kill("SIGKILL"); } catch { /* already dead */ }
          }
          resolve();
        }, GRACEFUL_STOP_TIMEOUT_MS);
        t.unref();
        child.once("close", () => {
          clearTimeout(t);
          resolve();
        });
      });
    } else {
      try { child.kill("SIGKILL"); } catch { /* already dead */ }
    }
    await this.cleanup();
  }

  /** Returns the child PID once spawned, or null. */
  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  private async runAutoSetup(): Promise<void> {
    const cc = this.options.autoSetup?.claudeCode;
    if (!cc) return;
    if (cc.writeSettings === false) return;
    const patterns = cc.allowedTools ?? this.options.mcp?.allowList ?? [];
    if (patterns.length === 0) return;
    const path = cc.settingsPath ? expandHome(cc.settingsPath) : defaultClaudeSettingsPath();
    await mergeClaudeSettings(path, patterns);
  }

  private async cleanup(): Promise<void> {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    await cleanupMcpForwarding(this.mcpSetup, this.options.mcp?.cleanupOnStop);
    this.mcpSetup = null;
  }

  private dispatch(event: SquireEvent): void {
    this.emit("event", event);
  }
}
