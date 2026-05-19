#!/usr/bin/env node
// Sanity check for personal data leaks. Fails if any of these surface in
// shipped files (markdown / TypeScript / JSON):
//   - Windows-style user paths under C:\Users\<name>\
//   - POSIX user paths under /home/<name>/ or /Users/<name>/
//   - IPv4 addresses (allowlist 127.0.0.1, 0.0.0.0, 255.255.255.0)
//   - Email addresses
//
// Excludes node_modules, dist, .git, coverage, and this script itself.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const TARGETS = [".md", ".ts", ".mts", ".cts", ".mjs", ".json", ".jsonl", ".yml", ".yaml"];
const SKIP = new Set(["node_modules", "dist", ".git", "coverage"]);
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

const PATTERNS = [
  { name: "windows_user_path", regex: /[A-Za-z]:\\\\Users\\\\[A-Za-z0-9_.-]+/g, allow: [] },
  { name: "windows_user_path_fwd", regex: /[A-Za-z]:\/Users\/[A-Za-z0-9_.-]+/g, allow: [] },
  { name: "posix_home_path", regex: /\/home\/[A-Za-z0-9_.-]+/g, allow: ["/home/runner"] },
  { name: "macos_user_path", regex: /\/Users\/[A-Za-z0-9_.-]+/g, allow: [] },
  {
    name: "ipv4",
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    allow: ["127.0.0.1", "0.0.0.0", "255.255.255.0"],
  },
  {
    name: "email",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    allow: ["noreply@anthropic.com", "noreply@github.com", "ejredd2007@gmail.com"],
  },
  {
    name: "ej_identifier",
    // Case-insensitive substring matches against a fixed list of internal-only identifiers.
    // These tokens should NEVER appear in shipped Squire files. They are not sensitive in
    // isolation, but their presence in a public OSS repo indicates leakage from internal
    // projects, client briefs, or memory.
    regex: /\b(mscmu|viralventures|magnific|war-room-private|sema-bridge|fanward|nexford|wesam|ej-brain|ejbrain|contabo|ej-voice|hyperframes|semaclaw|openclaw)\b/gi,
    allow: [],
  },
];

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!TARGETS.some((ext) => entry.endsWith(ext))) continue;
    if (relative(ROOT, full) === SELF) continue;
    const rel = relative(ROOT, full);
    if (entry === "package-lock.json" || entry === "yarn.lock") continue;
    const text = readFileSync(full, "utf8");
    for (const { name, regex, allow } of PATTERNS) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(text)) !== null) {
        const hit = m[0];
        if (allow.includes(hit)) continue;
        const lineNo = text.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${lineNo}: [${name}] ${hit}`);
      }
    }
  }
}

walk(ROOT);

if (offenders.length > 0) {
  process.stderr.write(`Sanity check FAILED. ${offenders.length} hit(s):\n`);
  for (const o of offenders) process.stderr.write("  " + o + "\n");
  process.exit(1);
} else {
  process.stdout.write("Sanity check passed.\n");
}
