// Minimal Squire example.
// Spawns Claude Code as a subprocess, sends one prompt,
// and prints streamed text deltas as they arrive.

import { Squire } from "@pythonluvr/squire";

const squire = new Squire({
  binary: "claude",
  args: ["--permission-mode", "bypassPermissions"],
  cwd: process.cwd(),
});

squire.on("event", (event) => {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "message_stop") {
    process.stdout.write(`\n[exit ${event.code}]\n`);
  } else if (event.type === "error") {
    process.stderr.write(`\n[error] ${event.error.message}\n`);
  }
});

await squire.start("In one short sentence, what does Squire do?");
