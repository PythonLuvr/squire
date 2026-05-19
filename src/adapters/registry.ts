// Module-level adapter registry. v1.0 ships one built-in adapter
// (`text-stream`); custom adapters register via `registerSquireAdapter`.
// Registration is process-global and last-write-wins by adapter name; this
// mirrors how Node's built-in module systems handle similar registries and
// keeps the v1.0 surface tiny.

import type { SquireAdapter } from "./types.js";
import { textStreamAdapter } from "./text-stream.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { geminiCliAdapter } from "./gemini-cli.js";
import { SquireError } from "../errors.js";

const registry = new Map<string, SquireAdapter>();
registry.set(textStreamAdapter.name, textStreamAdapter);
registry.set(claudeCodeAdapter.name, claudeCodeAdapter);
registry.set(geminiCliAdapter.name, geminiCliAdapter);

export function registerSquireAdapter(adapter: SquireAdapter): void {
  if (!adapter || typeof adapter.name !== "string" || adapter.name.length === 0) {
    throw new SquireError("INVALID_OPTIONS", "adapter must have a non-empty name");
  }
  if (typeof adapter.create !== "function") {
    throw new SquireError("INVALID_OPTIONS", `adapter ${adapter.name} must implement create()`);
  }
  registry.set(adapter.name, adapter);
}

export function getSquireAdapter(name: string): SquireAdapter {
  const a = registry.get(name);
  if (!a) {
    throw new SquireError(
      "INVALID_OPTIONS",
      `unknown adapter: ${name}. Built-in: text-stream. Use registerSquireAdapter() for custom adapters.`,
    );
  }
  return a;
}

export function listRegisteredAdapters(): string[] {
  return [...registry.keys()];
}
