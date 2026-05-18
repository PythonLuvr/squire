// Squire public API. Frozen at v1.0.0; future additions are additive only.
//
// General-purpose runtime for spawning CLI AI agents (Claude Code, Codex,
// Gemini CLI) as subprocesses with structured event streaming, MCP tool
// forwarding, and permission auto-setup.

export { Squire } from "./squire.js";
export type { SquireStartOptions, SquireStopOptions } from "./squire.js";

export type {
  SquireOptions,
  SquireMcpOptions,
  SquireMcpServerConfig,
  SquireAutoSetupOptions,
  SquireClaudeCodeAutoSetup,
} from "./options.js";

export type {
  SquireEvent,
  SquireEventType,
  SquireStdoutEvent,
  SquireStderrEvent,
  SquireTextDeltaEvent,
  SquireMessageStartEvent,
  SquireMessageStopEvent,
  SquireErrorEvent,
} from "./events.js";

export {
  SquireError,
  SquireAutoSetupError,
  type SquireErrorCode,
} from "./errors.js";

export type {
  SquireAdapter,
  SquireAdapterInstance,
  SquireAdapterContext,
} from "./adapters/types.js";
export { textStreamAdapter } from "./adapters/text-stream.js";
export {
  registerSquireAdapter,
  getSquireAdapter,
  listRegisteredAdapters,
} from "./adapters/registry.js";

export {
  defaultClaudeSettingsPath,
  mergeClaudeSettings,
  type ClaudeSettingsFile,
  type ClaudeSettingsMergeResult,
} from "./autosetup/claude-code-settings.js";

export { needsShell } from "./spawn.js";
