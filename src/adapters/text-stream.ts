// The v1.0 default adapter. Emits stdout chunks verbatim as both `stdout`
// events (raw) and `text_delta` events (semantic). Stderr passes through as
// `stderr` events. No parsing, no buffering. This matches the surface the
// extracted cli-bridge code emitted today; per-CLI structured parsers
// (Claude Code JSON streaming, Codex, Gemini CLI) land in v1.x.

import type { SquireAdapter, SquireAdapterInstance } from "./types.js";
import type { SquireEvent } from "../events.js";

class TextStreamInstance implements SquireAdapterInstance {
  onStdout(chunk: string): SquireEvent[] {
    return [
      { type: "stdout", chunk },
      { type: "text_delta", delta: chunk },
    ];
  }
  onStderr(chunk: string): SquireEvent[] {
    return [{ type: "stderr", chunk }];
  }
}

export const textStreamAdapter: SquireAdapter = {
  name: "text-stream",
  create(): SquireAdapterInstance {
    return new TextStreamInstance();
  },
};
