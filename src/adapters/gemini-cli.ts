// Gemini CLI stream-json adapter.
//
// Parses the line-delimited JSON emitted by `gemini --output-format
// stream-json -p "..."`. Each line is one of:
//   { "type": "init", "session_id": "...", "model": "...", ... }
//   { "type": "message", "role": "user" | "assistant", "content": "...",
//                       "delta": true | undefined }
//       assistant + delta=true -> text_delta
//       user messages are echoes; ignored
//   { "type": "tool_use", "tool_id": "...", "tool_name": "...",
//                         "parameters": {...} }            -> tool_call
//   { "type": "tool_result", "tool_id": "...", "status": "...", ... }
//                                                          -> tool_result
//   { "type": "result", "status": "success" | "error",
//                       "stats": { "input_tokens": n, "output_tokens": n, ... } }
//                                                          -> usage
//
// Unknown / unparseable lines pass through as raw `stdout` so consumers
// always see something.

import type { SquireAdapter, SquireAdapterInstance } from "./types.js";
import type { SquireEvent, SquireUsageEvent } from "../events.js";
import { NdjsonLineBuffer } from "./ndjson.js";

interface GeminiStats {
  input_tokens?: number;
  output_tokens?: number;
  cached?: number;
}

function mapStats(s: GeminiStats | undefined): SquireUsageEvent | null {
  if (!s || typeof s !== "object") return null;
  const ev: SquireUsageEvent = { type: "usage" };
  if (typeof s.input_tokens === "number") ev.inputTokens = s.input_tokens;
  if (typeof s.output_tokens === "number") ev.outputTokens = s.output_tokens;
  if (typeof s.cached === "number") ev.cacheReadTokens = s.cached;
  if (
    ev.inputTokens === undefined &&
    ev.outputTokens === undefined &&
    ev.cacheReadTokens === undefined
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
    return [{ type: "stdout", chunk: line + "\n" }];
  }

  const t = obj.type;
  if (t === "message") {
    if (obj.role === "assistant" && obj.delta === true && typeof obj.content === "string") {
      return [{ type: "text_delta", delta: obj.content }];
    }
    return [];
  }
  if (t === "tool_use" && typeof obj.tool_id === "string" && typeof obj.tool_name === "string") {
    return [
      {
        type: "tool_call",
        id: obj.tool_id,
        name: obj.tool_name,
        input: obj.parameters,
      },
    ];
  }
  if (t === "tool_result" && typeof obj.tool_id === "string") {
    const ev: SquireEvent = {
      type: "tool_result",
      id: obj.tool_id,
      // Gemini's tool_result line is status-only in observed captures;
      // pass through the whole object minus the discriminator so consumers
      // see whatever the vendor surfaced.
      output: { status: obj.status, content: obj.content },
    };
    if (obj.status === "error") ev.isError = true;
    return [ev];
  }
  if (t === "result") {
    const u = mapStats(obj.stats as GeminiStats | undefined);
    return u ? [u] : [];
  }
  // init and unknown types are silent.
  return [];
}

class GeminiCliInstance implements SquireAdapterInstance {
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

export const geminiCliAdapter: SquireAdapter = {
  name: "gemini-cli",
  create(): SquireAdapterInstance {
    return new GeminiCliInstance();
  },
};
