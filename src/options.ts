// Squire's options surface. Frozen at v1.0.0; future adds are additive only.
//
// Discipline: nothing in this file references OpenWar or any consumer-specific
// abstraction. The shapes here describe a generic CLI-spawn runtime.

/** MCP server config passed through to the bridged CLI. Shape mirrors the
 *  common `claude_desktop_config.json` / Claude Code MCP config schema:
 *  `{ command, args?, env? }`. Squire writes this to a temp file and passes
 *  it to the child via the configured flag. */
export interface SquireMcpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SquireMcpOptions {
  /**
   * Pre-built MCP config file to forward. When set, Squire passes
   * `<configFlag> <configPath>` to the child without writing a new file.
   * Mutually exclusive with `servers`; if both are set, `configPath` wins.
   */
  configPath?: string;
  /**
   * Inline server config. When set, Squire writes a temp JSON file in the
   * shape `{ mcpServers: { <name>: <SquireMcpServerConfig> } }` and forwards
   * its path to the child.
   */
  servers?: Record<string, SquireMcpServerConfig>;
  /** CLI flag used to point the child at the MCP config file. Default `--mcp-config`. */
  configFlag?: string;
  /**
   * Tool patterns the child should be pre-authorized to call. Squire does
   * NOT enforce this directly; it's consumed by `autoSetup.claudeCode` to
   * merge into Claude Code's user settings (Claude Code treats external MCP
   * tools as separate-trust). For other CLIs the list is informational only.
   */
  allowList?: string[];
  /** When true (default), the temp config file is deleted on `stop()`. */
  cleanupOnStop?: boolean;
}

export interface SquireClaudeCodeAutoSetup {
  /** When true (default), `start()` merges `allowList` patterns into the
   *  Claude Code user settings file. Set to false to skip the merge but keep
   *  Squire aware of the patterns. */
  writeSettings?: boolean;
  /** Patterns to merge into `permissions.allow`. Falls back to `mcp.allowList`
   *  if unset; explicit `allowedTools` wins when both are present. */
  allowedTools?: string[];
  /** Override the settings file path. Defaults to `~/.claude/settings.json`.
   *  Supports a leading `~/` for the home directory. */
  settingsPath?: string;
}

export interface SquireAutoSetupOptions {
  claudeCode?: SquireClaudeCodeAutoSetup;
}

export interface SquireOptions {
  /** Binary path or PATH-resolvable name. Required. */
  binary: string;
  /** Default args prepended before any per-call args. Empty by default. */
  args?: string[];
  /** Working directory for the child. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Extra env merged on top of `process.env`. Caller wins on conflict. */
  env?: Record<string, string>;
  /**
   * Hard timeout in ms for a single `start()` lifecycle. Default 600_000
   * (10 minutes). Pass 0 for unlimited.
   */
  timeoutMs?: number;
  /**
   * Override the shell detection. Squire defaults to spawning with
   * `shell: false`, escalating to `shell: true` on Windows when the binary
   * is `.cmd` / `.bat` or has no extension (PATHEXT walk via cmd.exe).
   * Setting this explicitly forces the spawn mode either way.
   */
  shell?: boolean;
  /** Optional MCP forwarding. Off when omitted. */
  mcp?: SquireMcpOptions;
  /** Optional permission auto-setup. Off when omitted. */
  autoSetup?: SquireAutoSetupOptions;
  /**
   * Name of a registered adapter (`text-stream` by default, or a custom
   * adapter previously registered via `registerSquireAdapter`). Adapters
   * own per-CLI output parsing.
   */
  adapter?: string;
}
