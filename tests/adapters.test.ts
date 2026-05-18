// Adapter registry coverage. Custom adapters register and resolve through
// the same lookup the Squire class uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerSquireAdapter,
  getSquireAdapter,
  listRegisteredAdapters,
} from "../src/adapters/registry.js";
import type { SquireAdapter } from "../src/adapters/types.js";
import { SquireError } from "../src/errors.js";

test("text-stream is registered by default", () => {
  const all = listRegisteredAdapters();
  assert.ok(all.includes("text-stream"), `expected text-stream in ${all.join(",")}`);
});

test("getSquireAdapter throws on unknown name", () => {
  assert.throws(
    () => getSquireAdapter("nope"),
    (err: Error) => err instanceof SquireError && (err as SquireError).code === "INVALID_OPTIONS",
  );
});

test("registerSquireAdapter: round-trip", () => {
  const fake: SquireAdapter = {
    name: "test-fake-codex",
    create() {
      return {
        onStdout: () => [],
        onStderr: () => [],
      };
    },
  };
  registerSquireAdapter(fake);
  assert.equal(getSquireAdapter("test-fake-codex"), fake);
});

test("registerSquireAdapter: rejects empty name", () => {
  assert.throws(
    () => registerSquireAdapter({ name: "", create: () => ({ onStdout: () => [], onStderr: () => [] }) } as SquireAdapter),
    (err: Error) => err instanceof SquireError,
  );
});

test("registerSquireAdapter: rejects missing create()", () => {
  assert.throws(
    () => registerSquireAdapter({ name: "broken" } as unknown as SquireAdapter),
    (err: Error) => err instanceof SquireError,
  );
});

test("last-write-wins on duplicate name (intentional)", () => {
  const a: SquireAdapter = { name: "test-dup", create: () => ({ onStdout: () => [{ type: "text_delta", delta: "a" }], onStderr: () => [] }) };
  const b: SquireAdapter = { name: "test-dup", create: () => ({ onStdout: () => [{ type: "text_delta", delta: "b" }], onStderr: () => [] }) };
  registerSquireAdapter(a);
  registerSquireAdapter(b);
  assert.equal(getSquireAdapter("test-dup"), b);
});
