// Claude Code permission auto-setup coverage. Mirrors the original
// OpenWar bridged-cli-settings tests, retargeted at Squire's surface.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mergeClaudeSettings,
  defaultClaudeSettingsPath,
  expandHome,
} from "../src/autosetup/claude-code-settings.js";
import { SquireAutoSetupError } from "../src/errors.js";

let TMP = "";
test.before(() => {
  TMP = mkdtempSync(join(tmpdir(), "squire-autosetup-"));
});
test.after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

test("defaultClaudeSettingsPath: returns a non-empty path", () => {
  const p = defaultClaudeSettingsPath();
  assert.ok(p.length > 0);
  assert.ok(p.includes(".claude"));
});

test("expandHome: leading ~/ is expanded", () => {
  const out = expandHome("~/foo");
  assert.ok(out.endsWith("foo"));
  assert.notEqual(out, "~/foo");
});

test("expandHome: leading ~ alone", () => {
  const out = expandHome("~");
  assert.ok(out.length > 1);
});

test("expandHome: no leading ~ -> identity", () => {
  assert.equal(expandHome("/abs/path"), "/abs/path");
  assert.equal(expandHome("rel/path"), "rel/path");
});

test("mergeClaudeSettings: creates new file when none exists", async () => {
  const path = join(TMP, "new-settings.json");
  const res = await mergeClaudeSettings(path, ["mcp__a__b", "mcp__a__c"]);
  assert.equal(res.createdNew, true);
  assert.deepEqual(res.added, ["mcp__a__b", "mcp__a__c"]);
  assert.deepEqual(res.alreadyPresent, []);
  const body = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(body.permissions.allow, ["mcp__a__b", "mcp__a__c"]);
});

test("mergeClaudeSettings: idempotent on second call", async () => {
  const path = join(TMP, "idempotent.json");
  await mergeClaudeSettings(path, ["mcp__a__b"]);
  const res = await mergeClaudeSettings(path, ["mcp__a__b"]);
  assert.deepEqual(res.added, []);
  assert.deepEqual(res.alreadyPresent, ["mcp__a__b"]);
});

test("mergeClaudeSettings: preserves unrelated keys", async () => {
  const path = join(TMP, "preserve.json");
  writeFileSync(path, JSON.stringify({
    theme: "dark",
    permissions: { allow: ["existing"], deny: ["nope"] },
    other: 42,
  }, null, 2));
  await mergeClaudeSettings(path, ["new-grant"]);
  const body = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(body.theme, "dark");
  assert.equal(body.other, 42);
  assert.deepEqual(body.permissions.deny, ["nope"]);
  assert.deepEqual(body.permissions.allow, ["existing", "new-grant"]);
});

test("mergeClaudeSettings: malformed JSON -> AUTOSETUP_PARSE", async () => {
  const path = join(TMP, "malformed.json");
  writeFileSync(path, "{ this is not json");
  await assert.rejects(
    () => mergeClaudeSettings(path, ["x"]),
    (err: Error) => err instanceof SquireAutoSetupError && (err as SquireAutoSetupError).code === "AUTOSETUP_PARSE",
  );
});

test("mergeClaudeSettings: array root -> AUTOSETUP_PARSE (not an object)", async () => {
  const path = join(TMP, "array-root.json");
  writeFileSync(path, "[]");
  await assert.rejects(
    () => mergeClaudeSettings(path, ["x"]),
    (err: Error) => err instanceof SquireAutoSetupError && (err as SquireAutoSetupError).code === "AUTOSETUP_PARSE",
  );
});

test("mergeClaudeSettings: missing permissions key is handled gracefully", async () => {
  const path = join(TMP, "no-perms.json");
  writeFileSync(path, JSON.stringify({ theme: "light" }));
  await mergeClaudeSettings(path, ["g1"]);
  const body = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(body.theme, "light");
  assert.deepEqual(body.permissions.allow, ["g1"]);
});

test("mergeClaudeSettings: empty patternsToAdd is a no-op write", async () => {
  const path = join(TMP, "empty.json");
  const res = await mergeClaudeSettings(path, []);
  assert.deepEqual(res.added, []);
  assert.equal(res.createdNew, true);
  const body = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(body.permissions.allow, []);
});
