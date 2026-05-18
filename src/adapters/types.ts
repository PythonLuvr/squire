// Adapter interface. Per-CLI output parsers implement this; the built-in
// `text-stream` adapter is the v1.0 default. Custom adapters can be
// registered via `registerSquireAdapter` for vendor CLIs Squire doesn't
// recognize natively.
//
// Adapters are stateless aside from per-instance scratch; one `create()`
// call per Squire lifecycle.

import type { SquireEvent } from "../events.js";

export interface SquireAdapterContext {
  binary: string;
  args: string[];
}

export interface SquireAdapterInstance {
  /** Called once per stdout chunk. Yields zero or more semantic events. */
  onStdout(chunk: string): SquireEvent[];
  /** Called once per stderr chunk. Default: emit a `stderr` event verbatim. */
  onStderr(chunk: string): SquireEvent[];
  /** Optional: called after child exit, before `message_stop`. Adapters can
   *  flush any buffered state here. */
  onClose?(code: number | null, signal: NodeJS.Signals | null): SquireEvent[];
}

export interface SquireAdapter {
  /** Stable adapter name (e.g. `text-stream`, `claude-code-json`). */
  readonly name: string;
  /** Per-lifecycle factory. */
  create(ctx: SquireAdapterContext): SquireAdapterInstance;
}
