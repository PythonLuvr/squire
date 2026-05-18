// Squire's typed error surface. Consumers can narrow on `code` for stable
// branching; the underlying cause is preserved on `.cause` where applicable.

export type SquireErrorCode =
  | "SPAWN_FAILED"
  | "TIMEOUT"
  | "NON_ZERO_EXIT"
  | "ADAPTER_UNSUPPORTED_FEATURE"
  | "ADAPTER_PARSE"
  | "INVALID_OPTIONS"
  | "ALREADY_STARTED"
  | "NOT_STARTED"
  | "AUTOSETUP_PARSE"
  | "AUTOSETUP_READ"
  | "AUTOSETUP_WRITE"
  | "MCP_CONFIG_WRITE";

export class SquireError extends Error {
  readonly code: SquireErrorCode;
  constructor(code: SquireErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.code = code;
    this.name = "SquireError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Thrown by `autoSetup.claudeCode` writers when the existing settings.json
 * is unreadable, malformed, or cannot be written. Carries the absolute path
 * so callers can surface a remediation message.
 */
export class SquireAutoSetupError extends SquireError {
  readonly path: string;
  constructor(code: "AUTOSETUP_PARSE" | "AUTOSETUP_READ" | "AUTOSETUP_WRITE", path: string, message: string) {
    super(code, message);
    this.name = "SquireAutoSetupError";
    this.path = path;
  }
}
