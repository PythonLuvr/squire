# Security policy

## Reporting a vulnerability

Squire spawns subprocess children based on caller-provided binaries and merges into the caller's `~/.claude/settings.json` file. If you find a security issue (subprocess escape, settings-file corruption, MCP config injection, etc.), please report it privately.

Email: ejredd2007@gmail.com
Subject prefix: `[squire security]`

Please include:
- Squire version (`npm ls @pythonluvr/squire`)
- Node version, OS
- Minimal repro
- Impact assessment (what an attacker can achieve)

We aim to acknowledge within 72 hours and ship a patch on the v1.x line within 14 days for confirmed issues.

## Scope

In scope:
- The public API surface in `src/index.ts`.
- The settings.json merge in `src/autosetup/`.
- The MCP config writer in `src/mcp/forwarder.ts`.
- The spawn logic in `src/spawn.ts`.

Out of scope:
- Vulnerabilities in the child CLIs Squire spawns (report those to the CLI vendor).
- Misuse of the public API (for example, passing untrusted input as `binary`).

## Supported versions

The current v1.x major line receives security fixes. Older majors do not.
