// Event union + built-in text-stream adapter coverage.

import { test } from "node:test";
import assert from "node:assert/strict";
import { textStreamAdapter } from "../src/adapters/text-stream.js";
import type { SquireEvent } from "../src/events.js";

test("text-stream adapter: emits stdout + text_delta for each chunk", () => {
  const inst = textStreamAdapter.create({ binary: "x", args: [] });
  const events = inst.onStdout("hello");
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { type: "stdout", chunk: "hello" });
  assert.deepEqual(events[1], { type: "text_delta", delta: "hello" });
});

test("text-stream adapter: stderr passes through verbatim", () => {
  const inst = textStreamAdapter.create({ binary: "x", args: [] });
  const events = inst.onStderr("oops\n");
  assert.deepEqual(events, [{ type: "stderr", chunk: "oops\n" }]);
});

test("text-stream adapter: onClose is undefined (no flush needed)", () => {
  const inst = textStreamAdapter.create({ binary: "x", args: [] });
  assert.equal(inst.onClose, undefined);
});

test("SquireEvent union narrows on `type`", () => {
  const e: SquireEvent = { type: "message_stop", code: 0, signal: null, assembled: "" };
  if (e.type === "message_stop") {
    assert.equal(e.code, 0);
    assert.equal(e.assembled, "");
  } else {
    assert.fail("type narrowing failed");
  }
});
