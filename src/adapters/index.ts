export type { SquireAdapter, SquireAdapterInstance, SquireAdapterContext } from "./types.js";
export { textStreamAdapter } from "./text-stream.js";
export { claudeCodeAdapter } from "./claude-code.js";
export { geminiCliAdapter } from "./gemini-cli.js";
export { registerSquireAdapter, getSquireAdapter, listRegisteredAdapters } from "./registry.js";
