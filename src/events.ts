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

/**
 * A tool invocation issued by the underlying CLI agent. Emitted by per-CLI
 * adapters that parse structured output (Claude Code stream-json, Gemini CLI
 * stream-json, etc.). The built-in `text-stream` adapter does not emit this.
 *
 * `id` is the vendor-supplied tool-call id; consumers match it against the
 * later `tool_result` event of the same `id`.
 * `input` is the raw, vendor-shaped arguments object as deserialized JSON.
 */
export interface SquireToolCallEvent {
  type: "tool_call";
  id: string;
  name: string;
  input: unknown;
}

/**
 * The matching result for a previously emitted `tool_call`. `id` matches the
 * `tool_call.id`. `output` is the raw vendor-shaped result (text, JSON, or
 * mixed). `isError` is true when the vendor flagged the tool as failed.
 */
export interface SquireToolResultEvent {
  type: "tool_result";
  id: string;
  output: unknown;
  isError?: boolean;
}

/**
 * Reasoning/thinking delta from CLIs that surface internal reasoning (e.g.
 * Claude Code's `thinking` content blocks). Separate from `text_delta` so
 * consumers can route or hide it independently of assistant-visible text.
 */
export interface SquireThinkingDeltaEvent {
  type: "thinking_delta";
  delta: string;
}

/**
 * Token-usage summary from CLIs that report it. All fields are optional
 * because not every vendor surfaces every counter. Adapters emit this at
 * most once per `start()` call, typically near the end of the stream.
 */
export interface SquireUsageEvent {
  type: "usage";
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Vendor-supplied session identifier carried by the CLI's initial system
 * message (Claude Code's `system/init` line, Gemini CLI's `init` line). Lets
 * callers capture a resumable session id without parsing stdout themselves;
 * pass it back to the CLI on the next turn (e.g. Claude Code's `--resume
 * <id>`) to continue the same conversation.
 *
 * Emitted at most once per `start()` call, early in the stream. Skipped when
 * the underlying CLI does not surface an id.
 */
export interface SquireSessionIdEvent {
  type: "session_id";
  sessionId: string;
  adapter?: "claude-code" | "gemini-cli";
}

export type SquireEvent =
  | SquireStdoutEvent
  | SquireStderrEvent
  | SquireTextDeltaEvent
  | SquireMessageStartEvent
  | SquireMessageStopEvent
  | SquireErrorEvent
  | SquireToolCallEvent
  | SquireToolResultEvent
  | SquireThinkingDeltaEvent
  | SquireUsageEvent
  | SquireSessionIdEvent;

export type SquireEventType = SquireEvent["type"];
