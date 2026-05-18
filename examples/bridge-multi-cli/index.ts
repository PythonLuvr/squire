// Multi-CLI bridge example.
//
// Demonstrates Squire's core differentiator: spawning multiple, different
// CLI agents from the same Node process and treating them as peers.
//
// Flow:
//   1. Claude Code answers the first prompt.
//   2. Its reply is captured and passed to Gemini CLI as context for a
//      follow-up prompt.
//   3. Gemini's reply is printed.

import { Squire, type SquireEvent } from "@pythonluvr/squire";

async function runOnce(binary: string, args: string[], prompt: string): Promise<string> {
  const squire = new Squire({ binary, args, cwd: process.cwd() });

  let assembled = "";
  squire.on("event", (event: SquireEvent) => {
    if (event.type === "text_delta") {
      assembled += event.delta;
      process.stdout.write(event.delta);
    } else if (event.type === "error") {
      process.stderr.write(`\n[${binary} error] ${event.error.message}\n`);
    }
  });

  process.stdout.write(`\n--- ${binary} ---\n`);
  await squire.start(prompt);
  process.stdout.write("\n");
  return assembled.trim();
}

const claudeReply = await runOnce(
  "claude",
  ["--permission-mode", "bypassPermissions"],
  "Name one strength of subprocess-based AI agent runtimes. One sentence.",
);

const geminiReply = await runOnce(
  "gemini",
  ["-m", "gemini-2.5-flash"],
  [
    "A peer agent just said the following about subprocess-based AI agent runtimes:",
    "",
    claudeReply,
    "",
    "Briefly add one counterpoint or complementary observation. One sentence.",
  ].join("\n"),
);

process.stdout.write("\n=== Bridged conversation complete ===\n");
process.stdout.write(`Claude:  ${claudeReply}\n`);
process.stdout.write(`Gemini:  ${geminiReply}\n`);
