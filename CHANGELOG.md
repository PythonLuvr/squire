# Changelog

All notable changes to Squire will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The v1.0 public API surface (everything exported from `src/index.ts`) is frozen. Additive changes ship on the v1.x line as minor bumps. Breaking changes wait for v2.0.

## [Unreleased]

### Added
- `SECURITY.md` with private vulnerability reporting path.
- CI matrix across Ubuntu, macOS, and Windows on Node 20 and 22, plus a dedicated coverage job.
- `scripts/check-no-openwar-imports.mjs` enforcing zero coupling between Squire's `src/` and OpenWar.
- `ej_identifier` blocklist in `scripts/check-sanity.mjs` catching internal-project leakage beyond the generic personal-data patterns.
- Expanded `.gitignore` covering `.env*`, cookie files, local fixture overrides, and editor/OS artifacts.

### Fixed
- `scripts/check-sanity.mjs` `SELF` resolution now uses `fileURLToPath` for cross-platform correctness. The previous URL-pathname hack worked on Windows by accident but failed on Linux and macOS.

### Changed
- README rewritten with natural-voice intro covering the spawn-pain problem, Squire's role, the tool-not-framework positioning, and the subscription-auth angle.
- README logo switched to the transparent variant for theme compatibility.

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

[Unreleased]: https://github.com/PythonLuvr/squire/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/PythonLuvr/squire/releases/tag/v1.0.0
