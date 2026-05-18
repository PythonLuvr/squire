// Claude Code permission auto-setup.
//
// Claude Code treats external MCP tools as separate-trust by design.
// Neither `--permission-mode bypassPermissions` nor `--allowedTools` covers
// them. The only programmatic path is to write the grants into Claude
// Code's user settings file before spawn.
//
// This module owns that write. Scope is deliberately narrow: Claude Code
// only. Other CLIs (Gemini CLI, Codex CLI) may need similar handling later;
// abstract when there's a second case, not before.

import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { SquireAutoSetupError } from "../errors.js";

/** Default settings file location. Same path on Windows, macOS, Linux per
 *  Claude Code's documented user-scope settings layout. */
export function defaultClaudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

/** Expand a leading `~/` to the home directory. Other tildes are left alone. */
export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

export interface ClaudeSettingsFile {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  // Anything else the operator has in their settings is preserved verbatim;
  // we only read + write the permissions.allow subtree.
  [key: string]: unknown;
}

export interface ClaudeSettingsMergeResult {
  /** Absolute path the merge wrote to. */
  path: string;
  /** Patterns that were appended. */
  added: string[];
  /** Patterns already present (idempotent path). */
  alreadyPresent: string[];
  /** True when the settings file did not exist before this call. */
  createdNew: boolean;
}

/**
 * Read the existing settings file (if any), add any missing patterns from
 * `patternsToAdd` to `permissions.allow`, write atomically. Idempotent: a
 * second call with the same patterns is a no-op on disk content.
 *
 * Throws `SquireAutoSetupError` with a stable code on failure:
 *   AUTOSETUP_READ   IO failure reading the existing file (other than
 *                    ENOENT, which is the create-new path).
 *   AUTOSETUP_PARSE  Existing file is malformed JSON. Caller halts rather
 *                    than clobbering.
 *   AUTOSETUP_WRITE  IO failure during atomic write.
 */
export async function mergeClaudeSettings(
  path: string,
  patternsToAdd: readonly string[],
): Promise<ClaudeSettingsMergeResult> {
  let existing: ClaudeSettingsFile;
  let createdNew = false;
  if (existsSync(path)) {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (err) {
      throw new SquireAutoSetupError(
        "AUTOSETUP_READ", path,
        `Cannot read Claude Code settings at ${path}: ${(err as Error).message}`,
      );
    }
    try {
      existing = JSON.parse(raw) as ClaudeSettingsFile;
      if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
        throw new Error("settings root must be a JSON object");
      }
    } catch (err) {
      throw new SquireAutoSetupError(
        "AUTOSETUP_PARSE", path,
        `Claude Code settings at ${path} is malformed JSON; refusing to clobber: ${(err as Error).message}`,
      );
    }
  } else {
    existing = {};
    createdNew = true;
  }

  const permsRaw = existing.permissions;
  const perms = (permsRaw && typeof permsRaw === "object" && !Array.isArray(permsRaw))
    ? permsRaw
    : {};
  const current = Array.isArray(perms.allow) ? perms.allow : [];
  const currentSet = new Set(current);

  const added: string[] = [];
  const alreadyPresent: string[] = [];
  for (const pat of patternsToAdd) {
    if (currentSet.has(pat)) {
      alreadyPresent.push(pat);
    } else {
      added.push(pat);
      currentSet.add(pat);
    }
  }

  const newAllow = [...current];
  for (const pat of added) newAllow.push(pat);

  const merged: ClaudeSettingsFile = {
    ...existing,
    permissions: {
      ...perms,
      allow: newAllow,
    },
  };

  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.squire-tmp-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(tmp, JSON.stringify(merged, null, 2) + "\n", "utf8");
    await rename(tmp, path);
  } catch (err) {
    try { await unlink(tmp); } catch { /* swallow */ }
    throw new SquireAutoSetupError(
      "AUTOSETUP_WRITE", path,
      `Cannot write Claude Code settings at ${path}: ${(err as Error).message}`,
    );
  }

  return { path, added, alreadyPresent, createdNew };
}
