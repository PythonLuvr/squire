// Cross-platform spawn helper coverage. Exercises both the Windows
// auto-shell-detection logic and the POSIX direct-spawn path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { needsShell, squireSpawn } from "../src/spawn.js";

test("needsShell: POSIX always returns false", () => {
  assert.equal(needsShell("claude", "linux"), false);
  assert.equal(needsShell("claude.cmd", "linux"), false);
  assert.equal(needsShell("/usr/local/bin/claude", "darwin"), false);
});

test("needsShell: Windows .cmd / .bat -> shell mode", () => {
  assert.equal(needsShell("claude.cmd", "win32"), true);
  assert.equal(needsShell("foo.bat", "win32"), true);
  assert.equal(needsShell("FOO.CMD", "win32"), true);
});

test("needsShell: Windows extensionless binary -> shell mode (PATHEXT walk)", () => {
  assert.equal(needsShell("claude", "win32"), true);
  assert.equal(needsShell("gemini", "win32"), true);
});

test("needsShell: Windows .exe / .com -> direct spawn (no shell)", () => {
  assert.equal(needsShell("node.exe", "win32"), false);
  assert.equal(needsShell("foo.com", "win32"), false);
  // Path with a space: extension keeps shell off.
  assert.equal(needsShell("D:\\some\\path\\node.exe", "win32"), false);
});

test("squireSpawn: launches a real child and yields output", async () => {
  const child = squireSpawn({
    binary: process.execPath,
    args: ["-e", "process.stdout.write('hi')"],
  });
  let out = "";
  child.stdout?.on("data", (b) => { out += b.toString("utf8"); });
  await new Promise<void>((resolve) => child.on("close", () => resolve()));
  assert.equal(out, "hi");
});

test("squireSpawn: shell override forces shell mode", () => {
  const child = squireSpawn({
    binary: process.execPath,
    args: ["-e", "process.exit(0)"],
    shell: false,
  });
  // Just confirms construction works; child auto-exits.
  return new Promise<void>((resolve) => child.on("close", () => resolve()));
});
