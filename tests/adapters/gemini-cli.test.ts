// Gemini CLI adapter coverage. Feeds a captured stream-json fixture and
// asserts the adapter produces the expected discriminated-union events.
//
// The fixture at tests/fixtures/gemini-cli/list-files.jsonl was derived
// from a real `gemini --output-format stream-json -p "..."` run against
// a temp dir containing alpha.txt, beta.txt, gamma.txt. It has been
// scrubbed of personal/machine-specific identifiers per the v1.1 brief.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { geminiCliAdapter } from "../../src/adapters/gemini-cli.js";
import type { SquireEvent } from "../../src/events.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "..", "fixtures", "gemini-cli", "list-files.jsonl");

function runAgainstFixture(): SquireEvent[] {
  const text = readFileSync(fixturePath, "utf8");
  const instance = geminiCliAdapter.create({ binary: "gemini", args: [] });
  const mid = Math.floor(text.length / 2);
  const events = [
    ...instance.onStdout(text.slice(0, mid)),
    ...instance.onStdout(text.slice(mid)),
  ];
  if (instance.onClose) events.push(...instance.onClose(0, null));
  return events;
}

test("gemini-cli adapter: at least one non-empty text_delta", () => {
  const events = runAgainstFixture();
  const texts = events.filter((e): e is Extract<SquireEvent, { type: "text_delta" }> => e.type === "text_delta");
  assert.ok(texts.length > 0, "expected at least one text_delta event");
  assert.ok(texts[0]!.delta.length > 0, "text_delta delta must be non-empty");
});

test("gemini-cli adapter: at least one tool_call with non-empty name", () => {
  const events = runAgainstFixture();
  const calls = events.filter((e): e is Extract<SquireEvent, { type: "tool_call" }> => e.type === "tool_call");
  assert.ok(calls.length > 0, "expected at least one tool_call event");
  assert.ok(calls[0]!.name.length > 0, "tool_call name must be non-empty");
  assert.equal(typeof calls[0]!.id, "string");
});

test("gemini-cli adapter: tool_result id matches its tool_call id", () => {
  const events = runAgainstFixture();
  const calls = events.filter((e): e is Extract<SquireEvent, { type: "tool_call" }> => e.type === "tool_call");
  const results = events.filter((e): e is Extract<SquireEvent, { type: "tool_result" }> => e.type === "tool_result");
  assert.ok(results.length > 0, "expected at least one tool_result event");
  const callIds = new Set(calls.map((c) => c.id));
  const matched = results.find((r) => callIds.has(r.id));
  assert.ok(matched, "tool_result id should match a previously seen tool_call id");
});

test("gemini-cli adapter: emits usage event with at least one counter", () => {
  const events = runAgainstFixture();
  const usages = events.filter((e): e is Extract<SquireEvent, { type: "usage" }> => e.type === "usage");
  assert.ok(usages.length > 0, "expected at least one usage event");
  const u = usages[usages.length - 1]!;
  const hasAny =
    typeof u.inputTokens === "number" ||
    typeof u.outputTokens === "number" ||
    typeof u.cacheReadTokens === "number";
  assert.ok(hasAny, "final usage event must have at least one token counter");
});

test("gemini-cli adapter: unparseable lines fall back to stdout (no crash)", () => {
  const instance = geminiCliAdapter.create({ binary: "gemini", args: [] });
  const events = instance.onStdout("not-json\n");
  const stdoutCount = events.filter((e) => e.type === "stdout").length;
  assert.ok(stdoutCount >= 1);
});

test("gemini-cli adapter: emits session_id exactly once from init", () => {
  const events = runAgainstFixture();
  const ids = events.filter((e): e is Extract<SquireEvent, { type: "session_id" }> => e.type === "session_id");
  assert.equal(ids.length, 1, "expected exactly one session_id event");
  assert.equal(ids[0]!.sessionId, "00000000-0000-0000-0000-000000000002");
  assert.equal(ids[0]!.adapter, "gemini-cli");
});

test("gemini-cli adapter: passes stderr through verbatim", () => {
  const instance = geminiCliAdapter.create({ binary: "gemini", args: [] });
  const events = instance.onStderr("warning: foo\n");
  assert.equal(events.length, 1);
  assert.equal(events[0]!.type, "stderr");
});

test("gemini-cli adapter: registry registration", async () => {
  const { listRegisteredAdapters } = await import("../../src/adapters/registry.js");
  const names = listRegisteredAdapters();
  assert.ok(names.includes("gemini-cli"));
  assert.ok(names.includes("claude-code"));
});
