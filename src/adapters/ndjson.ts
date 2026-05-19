// Tiny shared NDJSON line buffer. Both vendor adapters (Claude Code,
// Gemini CLI) emit one JSON object per line on stdout; chunks may split
// mid-line, so adapters need to buffer until they see `\n`.
//
// This helper is intentionally not exported from the package surface; it's
// an internal implementation detail of the per-CLI adapters.

export class NdjsonLineBuffer {
  private buf = "";

  /** Feed a chunk; returns any complete lines (without trailing newline). */
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let idx;
    while ((idx = this.buf.indexOf("\n")) !== -1) {
      const line = this.buf.slice(0, idx).replace(/\r$/, "");
      this.buf = this.buf.slice(idx + 1);
      if (line.length > 0) out.push(line);
    }
    return out;
  }

  /** Flush any buffered partial line (no trailing newline). */
  flush(): string[] {
    const tail = this.buf.replace(/\r$/, "");
    this.buf = "";
    return tail.length > 0 ? [tail] : [];
  }
}
