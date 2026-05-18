// Squire's event union. v1.0 ships the honest surface that the built-in
// text-stream adapter actually emits. Per-CLI adapters (Claude Code JSON
// streaming, Codex, Gemini CLI) land in v1.x and may emit a wider set of
// events; the union is designed to be extended without breaking consumers.
//
// Discriminated by the `type` field. Consumers should narrow on it.

/** A raw stdout chunk from the child process, as utf-8 text. */
export interface SquireStdoutEvent {
  type: "stdout";
  chunk: string;
}

/** A raw stderr chunk from the child process, as utf-8 text. */
export interface SquireStderrEvent {
  type: "stderr";
  chunk: string;
}

/**
 * A semantic text delta extracted by an adapter. For the built-in
 * `text-stream` adapter this is identical to the stdout chunk. Per-CLI
 * adapters that parse a structured output format (e.g. Claude Code's JSON
 * stream mode) emit `text_delta` only for the assistant-visible text and
 * route tool I/O through other event variants.
 */
export interface SquireTextDeltaEvent {
  type: "text_delta";
  delta: string;
}

/**
 * The child process started (fired after spawn succeeds). Useful for
 * consumers that want to track PID or attach extra handlers.
 */
export interface SquireMessageStartEvent {
  type: "message_start";
  pid: number;
}

/**
 * The child process exited cleanly. Code is the numeric exit status; signal
 * is set when the child was killed by a signal. `assembled` is the full
 * concatenated stdout text for callers that prefer batch-style access.
 */
export interface SquireMessageStopEvent {
  type: "message_stop";
  code: number | null;
  signal: NodeJS.Signals | null;
  assembled: string;
}

/**
 * Terminal error event. Fires for spawn failures (ENOENT, EACCES), hard
 * timeouts, non-zero exits with captured stderr, and adapter parse errors.
 * After an `error` event no further events are emitted.
 */
export interface SquireErrorEvent {
  type: "error";
  error: Error;
  /** Optional categorization for caller-side branching. */
  reason?: "spawn" | "timeout" | "exit" | "adapter" | "aborted";
  /** When applicable, tail of captured stderr for diagnostics. */
  stderrTail?: string;
}

export type SquireEvent =
  | SquireStdoutEvent
  | SquireStderrEvent
  | SquireTextDeltaEvent
  | SquireMessageStartEvent
  | SquireMessageStopEvent
  | SquireErrorEvent;

export type SquireEventType = SquireEvent["type"];
