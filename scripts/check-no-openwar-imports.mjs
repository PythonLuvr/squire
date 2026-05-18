#!/usr/bin/env node
// Enforces decoupling discipline: Squire's source tree must not import from
// OpenWar. The doc reference in docs/openwar-integration.md is fine; this
// script only walks src/.
//
// Fails if any .ts / .mts file under src/ contains:
//   from "...openwar..." / from '...openwar...'
//   require("...openwar...") / require('...openwar...')
// (case-insensitive)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const TARGETS = [".ts", ".mts", ".cts"];

const PATTERNS = [
  /from\s+['"][^'"]*openwar[^'"]*['"]/gi,
  /require\(\s*['"][^'"]*openwar[^'"]*['"]\s*\)/gi,
];

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!TARGETS.some((ext) => entry.endsWith(ext))) continue;
    const rel = relative(ROOT, full);
    const text = readFileSync(full, "utf8");
    for (const regex of PATTERNS) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(text)) !== null) {
        const lineNo = text.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${lineNo}: ${m[0]}`);
      }
    }
  }
}

try {
  statSync(SRC);
} catch {
  process.stdout.write("No src/ directory; skipping no-openwar-imports check.\n");
  process.exit(0);
}

walk(SRC);

if (offenders.length > 0) {
  process.stderr.write(
    `Decoupling check FAILED. Squire's src/ must not import from OpenWar.\n` +
      `${offenders.length} hit(s):\n`,
  );
  for (const o of offenders) process.stderr.write("  " + o + "\n");
  process.exit(1);
} else {
  process.stdout.write("No-openwar-imports check passed.\n");
}
