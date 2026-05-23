// Claude Code stream-json adapter.
//
// Parses the line-delimited JSON emitted by `claude --output-format
// stream-json --verbose --print`. Each line is one of:
//   { "type": "rate_limit_event", ... }      ignored
//   { "type": "system", "subtype": "init", ... }    ignored (env metadata)
//   { "type": "assistant", "message": { "content": [...] } }
//       content blocks may be:
//         { "type": "thinking", "thinking": "..." }   -> thinking_delta
//         { "type": "text", "text": "..." }           -> text_delta
//         { "type": "tool_use", "id": "...", "name": "...", "input": {...} }
//                                                     -> tool_call
//       message.usage (when present)                  -> usage (last write wins)
//   { "type": "user", "message": { "content": [...] } }
//       content blocks may be:
//         { "type": "tool_result", "tool_use_id": "...", "content": ..., "is_error": ? }
//                                                     -> tool_result
//   { "type": "result", "subtype": "success" | "error", "usage": {...}, ... }
//       (final summary; usage flushed here as well)
//
// Unknown / unparseable lines pass through as raw `stdout` events so consumers
// always see something. This is the "don't crash on unexpected formats"
// requirement from the adapter brief.

import type { SquireAdapter, SquireAdapterInstance } from "./types.js";
import type { SquireEvent, SquireUsageEvent } from "../events.js";
import { NdjsonLineBuffer } from "./ndjson.js";

interface UsageRaw {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

function mapUsage(u: UsageRaw | undefined): SquireUsageEvent | null {
  if (!u || typeof u !== "object") return null;
  const ev: SquireUsageEvent = { type: "usage" };
  if (typeof u.input_tokens === "number") ev.inputTokens = u.input_tokens;
  if (typeof u.output_tokens === "number") ev.outputTokens = u.output_tokens;
  if (typeof u.cache_read_input_tokens === "number") ev.cacheReadTokens = u.cache_read_input_tokens;
  if (typeof u.cache_creation_input_tokens === "number") ev.cacheWriteTokens = u.cache_creation_input_tokens;
  // No fields => skip (don't emit empty usage events).
  if (
    ev.inputTokens === undefined &&
    ev.outputTokens === undefined &&
    ev.cacheReadTokens === undefined &&
    ev.cacheWriteTokens === undefined
  ) {
    return null;
  }
  return ev;
}

function parseLine(line: string): SquireEvent[] {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line) as Record<string, unknown>;
  } catch {
    // Unparseable: fall back to raw stdout so consumers still see the bytes.
    return [{ type: "stdout", chunk: line + "\n" }];
  }

  const out: SquireEvent[] = [];
  const t = obj.type;

  if (t === "assistant" && obj.message && typeof obj.message === "object") {
    const msg = obj.message as Record<string, unknown>;
    const content = Array.isArray(msg.content) ? (msg.content as Array<Record<string, unknown>>) : [];
    for (const block of content) {
      const bt = block.type;
      if (bt === "thinking" && typeof block.thinking === "string" && block.thinking.length > 0) {
        out.push({ type: "thinking_delta", delta: block.thinking });
      } else if (bt === "text" && typeof block.text === "string") {
        out.push({ type: "text_delta", delta: block.text });
      } else if (bt === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
        out.push({ type: "tool_call", id: block.id, name: block.name, input: block.input });
      }
    }
    const u = mapUsage(msg.usage as UsageRaw | undefined);
    if (u) out.push(u);
  } else if (t === "user" && obj.message && typeof obj.message === "object") {
    const msg = obj.message as Record<string, unknown>;
    const content = Array.isArray(msg.content) ? (msg.content as Array<Record<string, unknown>>) : [];
    for (const block of content) {
      if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const ev: SquireEvent = {
          type: "tool_result",
          id: block.tool_use_id,
          output: block.content,
        };
        if (block.is_error === true) ev.isError = true;
        out.push(ev);
      }
    }
  } else if (t === "result") {
    const u = mapUsage(obj.usage as UsageRaw | undefined);
    if (u) out.push(u);
  } else if (t === "system" && obj.subtype === "init" && typeof obj.session_id === "string" && obj.session_id.length > 0) {
    out.push({ type: "session_id", sessionId: obj.session_id, adapter: "claude-code" });
  }
  // rate_limit_event and any unknown type are intentionally silent.
  return out;
}

class ClaudeCodeInstance implements SquireAdapterInstance {
  private buf = new NdjsonLineBuffer();
  onStdout(chunk: string): SquireEvent[] {
    const events: SquireEvent[] = [{ type: "stdout", chunk }];
    for (const line of this.buf.push(chunk)) {
      events.push(...parseLine(line));
    }
    return events;
  }
  onStderr(chunk: string): SquireEvent[] {
    return [{ type: "stderr", chunk }];
  }
  onClose(): SquireEvent[] {
    const events: SquireEvent[] = [];
    for (const line of this.buf.flush()) {
      events.push(...parseLine(line));
    }
    return events;
  }
}

export const claudeCodeAdapter: SquireAdapter = {
  name: "claude-code",
  create(): SquireAdapterInstance {
    return new ClaudeCodeInstance();
  },
};
