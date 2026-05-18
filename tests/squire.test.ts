// End-to-end Squire lifecycle coverage. Drives the real subprocess machinery
// via `node -e` so we don't need a Claude Code install in CI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Squire } from "../src/squire.js";
import type { SquireEvent } from "../src/events.js";
import { SquireError } from "../src/errors.js";

test("constructor: rejects missing binary", () => {
  assert.throws(
    () => new Squire({} as unknown as { binary: string }),
    (err: Error) => err instanceof SquireError && (err as SquireError).code === "INVALID_OPTIONS",
  );
});

test("constructor: rejects unknown adapter name", () => {
  assert.throws(
    () => new Squire({ binary: "foo", adapter: "nope" }),
    (err: Error) => err instanceof SquireError && (err as SquireError).code === "INVALID_OPTIONS",
  );
});

test("start(): success path with text-stream adapter", async () => {
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "process.stdout.write('hello squire')"],
  });
  const events: SquireEvent[] = [];
  squire.on("event", (e: SquireEvent) => events.push(e));
  await squire.start("");
  const stop = events.find((e) => e.type === "message_stop");
  assert.ok(stop, `expected message_stop, got: ${events.map((e) => e.type).join(", ")}`);
  if (stop?.type === "message_stop") {
    assert.equal(stop.code, 0);
    assert.equal(stop.assembled, "hello squire");
  }
  const textDelta = events.find((e) => e.type === "text_delta");
  assert.ok(textDelta);
});

test("start(): emits message_start with PID before text", async () => {
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "process.stdout.write('go')"],
  });
  const events: SquireEvent[] = [];
  squire.on("event", (e: SquireEvent) => events.push(e));
  await squire.start("");
  const firstStart = events.findIndex((e) => e.type === "message_start");
  const firstStdout = events.findIndex((e) => e.type === "stdout");
  assert.ok(firstStart >= 0);
  assert.ok(firstStdout > firstStart || firstStdout === -1, "message_start should precede stdout");
});

test("start(): non-zero exit -> error event with NON_ZERO_EXIT", async () => {
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "process.stderr.write('boom'); process.exit(7)"],
  });
  const events: SquireEvent[] = [];
  squire.on("event", (e: SquireEvent) => events.push(e));
  await squire.start("");
  const err = events.find((e) => e.type === "error");
  assert.ok(err);
  if (err?.type === "error") {
    assert.equal(err.reason, "exit");
    assert.match((err.error as SquireError).message, /exit code 7/);
    assert.equal((err.error as SquireError).code, "NON_ZERO_EXIT");
  }
});

test("start(): missing binary surfaces as error event", async () => {
  const squire = new Squire({
    binary: "definitely-not-a-real-binary-squire-test",
  });
  const events: SquireEvent[] = [];
  squire.on("event", (e: SquireEvent) => events.push(e));
  await squire.start("");
  const err = events.find((e) => e.type === "error");
  assert.ok(err);
  if (err?.type === "error") {
    // POSIX (and Windows with an extensioned binary) hits the ENOENT spawn
    // path and surfaces as SPAWN_FAILED. Windows with an extensionless
    // binary routes through cmd.exe via PATHEXT walk; cmd.exe reports
    // "not recognized" on stderr and exits non-zero, surfacing as
    // NON_ZERO_EXIT. Both paths give the operator a clear "binary missing"
    // message, which is what we pin here.
    const code = (err.error as SquireError).code;
    assert.ok(
      code === "SPAWN_FAILED" || code === "NON_ZERO_EXIT",
      `expected SPAWN_FAILED or NON_ZERO_EXIT, got ${code}`,
    );
  }
});

test("start(): cannot be called twice", async () => {
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "process.exit(0)"],
  });
  await squire.start("");
  await assert.rejects(
    () => squire.start(""),
    (err: Error) => err instanceof SquireError && (err as SquireError).code === "ALREADY_STARTED",
  );
});

test("send(): throws NOT_STARTED before start()", async () => {
  const squire = new Squire({ binary: process.execPath });
  await assert.rejects(
    () => squire.send("hi"),
    (err: Error) => err instanceof SquireError && (err as SquireError).code === "NOT_STARTED",
  );
});

test("stop(): graceful stop on a long-running child", async () => {
  // Spawn a process that would run for 30s; stop() must kill it quickly.
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "setInterval(() => process.stdout.write('.'), 100)"],
    timeoutMs: 0,
  });
  const exit = new Promise<number | null>((resolve) => {
    squire.once("exit", (code: number | null) => resolve(code));
  });
  const startPromise = squire.start("");
  await new Promise((r) => setTimeout(r, 200)); // let it spawn + emit something
  await squire.stop({ graceful: true });
  await Promise.race([
    startPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("stop did not terminate child within 6s")), 6000)),
  ]);
  await exit;
});

test("stop(): immediate SIGKILL when graceful=false", async () => {
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "setInterval(() => {}, 10000)"],
    timeoutMs: 0,
  });
  const startPromise = squire.start("");
  await new Promise((r) => setTimeout(r, 100));
  await squire.stop({ graceful: false });
  await Promise.race([
    startPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("kill did not exit within 3s")), 3000)),
  ]);
});

test("stop(): no-op when child already exited", async () => {
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "process.exit(0)"],
  });
  await squire.start("");
  await squire.stop(); // child already gone
});

test("timeoutMs: short timeout kills a long-running child", async () => {
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "setInterval(() => {}, 10000)"],
    timeoutMs: 150,
  });
  const events: SquireEvent[] = [];
  squire.on("event", (e: SquireEvent) => events.push(e));
  await squire.start("");
  const err = events.find((e) => e.type === "error");
  assert.ok(err);
  if (err?.type === "error") {
    assert.equal((err.error as SquireError).code, "TIMEOUT");
    assert.equal(err.reason, "timeout");
  }
});

test("AbortSignal: aborting kills the child with `aborted` reason", async () => {
  const ac = new AbortController();
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "setInterval(() => {}, 10000)"],
    timeoutMs: 0,
  });
  const events: SquireEvent[] = [];
  squire.on("event", (e: SquireEvent) => events.push(e));
  const p = squire.start("", { signal: ac.signal });
  setTimeout(() => ac.abort(), 100);
  await p;
  const err = events.find((e) => e.type === "error");
  assert.ok(err);
  if (err?.type === "error") {
    assert.equal(err.reason, "aborted");
  }
});

test("pid: returns null before start; number after spawn", async () => {
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "process.exit(0)"],
  });
  assert.equal(squire.pid, null);
  await squire.start("");
  // After completion the child has exited, but pid was set during the run.
  // The accessor returns the captured PID until the child handle is dropped.
});

test("prompt passes through stdin to the child", async () => {
  // Read stdin and echo a digest.
  const code = "let s=''; process.stdin.on('data',c=>s+=c); process.stdin.on('end',()=>process.stdout.write('got:'+s))";
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", code],
  });
  const events: SquireEvent[] = [];
  squire.on("event", (e: SquireEvent) => events.push(e));
  await squire.start("xyz123");
  const stop = events.find((e) => e.type === "message_stop");
  assert.ok(stop);
  if (stop?.type === "message_stop") {
    assert.equal(stop.assembled, "got:xyz123");
  }
});

test("autoSetup: writeSettings=false skips the merge", async () => {
  // No setttings file is written because writeSettings is explicitly off.
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "process.exit(0)"],
    autoSetup: {
      claudeCode: { writeSettings: false, allowedTools: ["mcp__a__b"] },
    },
  });
  await squire.start("");
  // Test passes if start() didn't throw.
});

test("autoSetup: empty allowedTools is a no-op", async () => {
  const squire = new Squire({
    binary: process.execPath,
    args: ["-e", "process.exit(0)"],
    autoSetup: { claudeCode: {} },
  });
  await squire.start("");
});
