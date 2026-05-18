# Contributing to Squire

## Ground rules

- MIT license. By submitting a PR you agree your contribution is MIT-licensed.
- v1.0 public API (everything exported from `src/index.ts`) is **frozen**. Additive changes only on the v1.x line. Breaking changes wait for v2.0.
- Zero new runtime dependencies. Squire ships with Node stdlib only. Dev dependencies are restricted to `typescript` and `@types/node`.
- TypeScript strict mode. `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch` are on.
- No em dashes in any shipped file. The em-dash gate (`npm run lint:em-dashes`) is enforced in CI.
- No personal data. The sanity gate (`npm run lint:sanity`) rejects user paths, IPv4 outside the allowlist, and email addresses.

## Local development

```bash
git clone https://github.com/PythonLuvr/squire
cd squire
npm install
npm run check        # lint + build + test
npm run check:strict # adds the coverage gate (>=85% on src/)
```

The test suite uses Node's built-in test runner via `tsx`. No Jest, no Mocha, no Vitest.

## Adding a per-CLI adapter

Per-CLI adapters live under `src/adapters/`. The shape is documented in [`docs/api.md`](api.md#custom-adapters). New built-in adapters need:

1. A `SquireAdapter` implementation under `src/adapters/<name>.ts`.
2. Registration from `src/adapters/registry.ts`.
3. Snapshot fixtures from real CLI runs under `tests/fixtures/<name>/`.
4. A test file at `tests/adapters/<name>.test.ts` covering the parse path end-to-end.
5. A row in the README's "Supported CLIs" table.

Adapters land in v1.x minor bumps when they add new event types to the union (additive), or in patch bumps when they fix parser bugs.

## PR review pattern

- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). The release notes script reads them.
- One concern per PR. Combined refactors are harder to review and roll back.
- Test the change. PRs without tests for new behavior get bounced.
- Run `npm run check` locally before pushing; CI runs the same matrix on Windows, macOS, and Linux.

## Reporting issues

[github.com/PythonLuvr/squire/issues](https://github.com/PythonLuvr/squire/issues). Include the Squire version, Node version, OS, and a minimal repro. CLI-specific bugs (Claude Code, Codex, Gemini CLI quirks) should include the exact CLI version too.
