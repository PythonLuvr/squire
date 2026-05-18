// MCP forwarder coverage.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { setupMcpForwarding, cleanupMcpForwarding } from "../src/mcp/forwarder.js";

test("setupMcpForwarding: returns null when mcp is undefined", async () => {
  const setup = await setupMcpForwarding(undefined);
  assert.equal(setup, null);
});

test("setupMcpForwarding: pre-built configPath passes through", async () => {
  const setup = await setupMcpForwarding({ configPath: "/some/path/mcp.json" });
  assert.ok(setup);
  assert.equal(setup!.configPath, "/some/path/mcp.json");
  assert.deepEqual(setup!.extraArgs, ["--mcp-config", "/some/path/mcp.json"]);
  assert.equal(setup!.squireOwnedFile, false);
});

test("setupMcpForwarding: configFlag override", async () => {
  const setup = await setupMcpForwarding({ configPath: "/p.json", configFlag: "--mcp" });
  assert.deepEqual(setup!.extraArgs, ["--mcp", "/p.json"]);
});

test("setupMcpForwarding: inline servers writes temp file", async () => {
  const setup = await setupMcpForwarding({
    servers: { myserver: { command: "node", args: ["./mcp.js"] } },
  });
  assert.ok(setup);
  assert.ok(existsSync(setup!.configPath));
  const body = JSON.parse(await readFile(setup!.configPath, "utf8"));
  assert.deepEqual(body, {
    mcpServers: {
      myserver: { command: "node", args: ["./mcp.js"] },
    },
  });
  assert.equal(setup!.squireOwnedFile, true);
  await cleanupMcpForwarding(setup, true);
  assert.equal(existsSync(setup!.configPath), false);
});

test("setupMcpForwarding: configPath wins when both configPath and servers set", async () => {
  const setup = await setupMcpForwarding({
    configPath: "/pre.json",
    servers: { x: { command: "y" } },
  });
  assert.equal(setup!.configPath, "/pre.json");
  assert.equal(setup!.squireOwnedFile, false);
});

test("cleanupMcpForwarding: respects cleanupOnStop=false", async () => {
  const setup = await setupMcpForwarding({
    servers: { s: { command: "node" } },
  });
  assert.ok(setup);
  await cleanupMcpForwarding(setup, false);
  assert.equal(existsSync(setup!.configPath), true);
  // Now actually clean up so we don't leave temp files behind.
  await cleanupMcpForwarding(setup, true);
});

test("cleanupMcpForwarding: null setup is a no-op", async () => {
  await cleanupMcpForwarding(null, true);
});

test("cleanupMcpForwarding: pre-built file is left alone", async () => {
  const setup = await setupMcpForwarding({ configPath: "/never/touch/this.json" });
  // Pre-built path: cleanup should NOT try to delete it even with cleanupOnStop=true.
  await cleanupMcpForwarding(setup, true);
});
