# Changelog

All notable changes to Squire will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The v1.0 public API surface (everything exported from `src/index.ts`) is frozen. Additive changes ship on the v1.x line as minor bumps. Breaking changes wait for v2.0.

## [Unreleased]

## [1.1.0] - 2026-05-19

### Added
- `claude-code` adapter: parses Claude Code's `--output-format stream-json --verbose --print` output into semantic events.
- `gemini-cli` adapter: parses Gemini CLI's `--output-format stream-json` output into semantic events.
- Four additive `SquireEvent` variants emitted by per-CLI adapters: `tool_call`, `tool_result`, `thinking_delta`, `usage`. All v1.0 event shapes remain unchanged.
- Captured stream-json fixtures under `tests/fixtures/claude-code/` and `tests/fixtures/gemini-cli/`, derived from real CLI runs and scrubbed of machine-specific identifiers.
- Adapter unit tests under `tests/adapters/` covering parsing, tool-id matching, usage emission, unparseable-line fallback, and stderr passthrough.
- Internal `NdjsonLineBuffer` helper for line-delimited JSON parsing (not exported).
- `SECURITY.md` with private vulnerability reporting path.
- CI matrix across Ubuntu, macOS, and Windows on Node 20 and 22, plus a dedicated coverage job.
- `scripts/check-no-openwar-imports.mjs` enforcing zero coupling between Squire's `src/` and OpenWar.
- `ej_identifier` blocklist in `scripts/check-sanity.mjs` catching internal-project leakage beyond the generic personal-data patterns.
- Expanded `.gitignore` covering `.env*`, cookie files, local fixture overrides, and editor/OS artifacts.

### Changed
- `scripts/check-sanity.mjs` now scans `.jsonl` files so committed test fixtures pass through the same gates as TypeScript and Markdown.
- README rewritten with natural-voice intro covering the spawn-pain problem, Squire's role, the tool-not-framework positioning, and the subscription-auth angle.
- README "Supported CLIs" table updated to reference the new dedicated adapters.
- README logo switched to the transparent variant for theme compatibility.

### Fixed
- `scripts/check-sanity.mjs` `SELF` resolution now uses `fileURLToPath` for cross-platform correctness. The previous URL-pathname hack worked on Windows by accident but failed on Linux and macOS.

### Deferred
- Dedicated `codex` adapter. The OpenAI Codex CLI was not installed on the build machine at fixture-capture time; shipping an invented parser without a real fixture would re-create the v1.0 "fake standalone" failure mode the v1.1 brief explicitly called out. Codex users should use the default `text-stream` adapter for now; a follow-up release will add the dedicated parser once a real capture is available.

## [1.0.0] - 2026-05-18

### Added
- Initial public release.
- `Squire` class managing one child-process lifecycle: `start()`, `send()`, `stop()`, plus `pid`.
- Cross-platform `child_process.spawn` wrapper with Windows `.cmd` / `.bat` / extensionless-binary handling. POSIX never uses a shell; Windows auto-detects via `needsShell()`.
- `SquireEvent` discriminated union: `stdout`, `stderr`, `text_delta`, `message_start`, `message_stop`, `error`.
- Built-in `text-stream` adapter. `text_delta` duplicates `stdout` in v1.0; per-CLI parsers are reserved for v1.1.
- `SquireAdapter` public interface for consumers to register custom parsers via `registerSquireAdapter`.
- MCP forwarding: pass inline `mcp.servers` (Squire writes a temp config) or `mcp.configPath` (Squire passes it through). `--mcp-config` flag defaults to the standard, overridable via `mcp.configFlag`.
- Claude Code permission auto-setup: `autoSetup.claudeCode` merges `allowList` patterns into `~/.claude/settings.json` atomically.
- `SquireError` with discriminated `code` field and `SquireAutoSetupError` carrying the offending settings path.
- Full TypeScript types for every public surface.
- 52 tests, 96.3% line coverage on `src/`.
- Documentation: `README.md`, `docs/api.md`, `docs/openwar-integration.md`, `docs/contributing.md`.

[Unreleased]: https://github.com/PythonLuvr/squire/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/PythonLuvr/squire/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/PythonLuvr/squire/releases/tag/v1.0.0
