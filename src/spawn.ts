// Cross-platform child_process spawn helper. The Windows quirks are the
// load-bearing piece of this module; POSIX is unaffected.
//
// Windows needs `shell: true` in two cases:
//   1. The binary explicitly ends in .cmd or .bat. Node's child_process
//      cannot spawn those without a shell on Windows (documented).
//   2. The binary has no extension at all (e.g. `claude`). That's the
//      natural shape operators type to match the binary's name on PATH.
//      Without shell mode, Windows CreateProcess does not walk PATHEXT, so
//      npm-installed CLIs (which land as .cmd shims) fail with ENOENT.
//      Shell mode lets cmd.exe do the PATHEXT walk.
//
// We do NOT unconditionally enable shell on Windows because the shell
// re-parses argv and mangles any binary path containing a space (the
// `C:\Program Files\nodejs\node.exe` case). Direct executables with an
// extension (.exe, .com) keep shell: false; CreateProcess handles them fine.

import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";

export interface SquireSpawnOptions {
  binary: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** When set, forces shell mode either way; otherwise auto-detected. */
  shell?: boolean;
}

export function needsShell(binary: string, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== "win32") return false;
  if (/\.(cmd|bat)$/i.test(binary)) return true;
  // No extension at all (e.g. "claude") -> shell mode for PATHEXT walk.
  if (!/\.[^./\\]+$/.test(binary)) return true;
  return false;
}

export function squireSpawn(opts: SquireSpawnOptions): ChildProcess {
  const spawnOpts: SpawnOptions = {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: opts.shell ?? needsShell(opts.binary),
    windowsHide: true,
  };
  return nodeSpawn(opts.binary, opts.args, spawnOpts);
}
