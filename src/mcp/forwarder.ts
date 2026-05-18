// MCP forwarding. Squire's role is narrow: take the caller's MCP config
// (either an inline `servers` map or a pre-built file path) and wire it
// into the child CLI's argv via `--mcp-config <path>` (or a custom flag).
//
// What Squire does NOT do:
//   - Implement an MCP server. The servers in `servers` are pointers to
//     external processes; Squire just records them in a config file.
//   - Authorize tools. That's the caller's responsibility (or the bridged
//     CLI's own permission gate).
//   - Negotiate or translate protocol versions. The child CLI speaks MCP;
//     Squire doesn't sit on the wire.

import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { SquireError } from "../errors.js";
import type { SquireMcpOptions } from "../options.js";

export interface McpForwardSetup {
  /** Absolute path of the config file that will be passed to the child. */
  configPath: string;
  /** CLI argv tail to inject before the prompt (`["--mcp-config", configPath]`). */
  extraArgs: string[];
  /** True if Squire wrote the file (cleanup on stop); false if pre-built. */
  squireOwnedFile: boolean;
}

/**
 * Materialize the MCP config (if inline `servers` was provided) and return
 * the argv tail that points the child at it.
 *
 * Returns `null` when MCP forwarding is not requested.
 *
 * Throws `SquireError` with code `MCP_CONFIG_WRITE` on IO failure.
 */
export async function setupMcpForwarding(mcp: SquireMcpOptions | undefined): Promise<McpForwardSetup | null> {
  if (!mcp) return null;
  const flag = mcp.configFlag ?? "--mcp-config";

  if (mcp.configPath) {
    return {
      configPath: mcp.configPath,
      extraArgs: [flag, mcp.configPath],
      squireOwnedFile: false,
    };
  }

  if (mcp.servers && Object.keys(mcp.servers).length > 0) {
    const dir = tmpdir();
    const path = join(dir, `squire-mcp-${randomBytes(6).toString("hex")}.json`);
    const body = JSON.stringify({ mcpServers: mcp.servers }, null, 2) + "\n";
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path, body, "utf8");
    } catch (err) {
      throw new SquireError(
        "MCP_CONFIG_WRITE",
        `cannot write Squire MCP config at ${path}: ${(err as Error).message}`,
        { cause: err },
      );
    }
    return {
      configPath: path,
      extraArgs: [flag, path],
      squireOwnedFile: true,
    };
  }

  return null;
}

/** Best-effort cleanup; never throws. */
export async function cleanupMcpForwarding(setup: McpForwardSetup | null, cleanupOnStop: boolean | undefined): Promise<void> {
  if (!setup) return;
  if (!setup.squireOwnedFile) return;
  if (cleanupOnStop === false) return;
  try { await unlink(setup.configPath); } catch { /* swallow */ }
}
