#!/usr/bin/env node
// Runs the test suite under Node's native --experimental-test-coverage and
// asserts >=85% line coverage on Squire's source tree.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const TRACKED = [
  ["src/", 85],
];

function findTests(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) findTests(path, out);
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const tests = findTests(join(repoRoot, "tests")).sort();
if (tests.length === 0) {
  console.error("no tests found");
  process.exit(1);
}

mkdirSync(join(repoRoot, "coverage"), { recursive: true });

const args = [
  "--import",
  "tsx",
  "--test",
  "--experimental-test-coverage",
  "--test-reporter",
  "spec",
  "--test-reporter-destination",
  "stdout",
  "--test-reporter",
  "lcov",
  "--test-reporter-destination",
  join(repoRoot, "coverage", "lcov.info"),
  ...tests,
];

const child = spawn(process.execPath, args, {
  stdio: ["inherit", "inherit", "inherit"],
  cwd: repoRoot,
});
child.on("exit", (code) => {
  if (code !== 0) {
    console.error(`tests failed with exit code ${code}`);
    process.exit(code ?? 1);
  }
  verify();
});
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

function verify() {
  const lcovPath = join(repoRoot, "coverage", "lcov.info");
  if (!existsSync(lcovPath)) {
    console.error(`coverage report not found at ${lcovPath}`);
    process.exit(1);
  }
  const raw = readFileSync(lcovPath, "utf8");
  const fileEntries = parseLcov(raw);
  let failures = 0;
  for (const [prefix, threshold] of TRACKED) {
    const matching = fileEntries.filter((f) => {
      const rel = relative(repoRoot, f.source).split(sep).join("/");
      return rel.startsWith(prefix);
    });
    if (matching.length === 0) {
      console.error(`coverage: no files found under ${prefix} (skipping)`);
      continue;
    }
    let totalLines = 0;
    let hitLines = 0;
    for (const m of matching) {
      totalLines += m.lf;
      hitLines += m.lh;
    }
    const pct = totalLines === 0 ? 100 : (hitLines / totalLines) * 100;
    const status = pct >= threshold ? "PASS" : "FAIL";
    console.log(
      `${status}  ${prefix.padEnd(20)}  ${hitLines}/${totalLines} lines (${pct.toFixed(1)}%) [>= ${threshold}%]`,
    );
    if (pct < threshold) failures++;
  }
  if (failures > 0) {
    console.error(`coverage: ${failures} tracked director(y/ies) below threshold`);
    process.exit(1);
  }
  console.log("coverage gates passed");
}

function parseLcov(text) {
  const files = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      current = { source: line.slice(3), lf: 0, lh: 0 };
      files.push(current);
    } else if (line.startsWith("LF:") && current) {
      current.lf = Number(line.slice(3)) || 0;
    } else if (line.startsWith("LH:") && current) {
      current.lh = Number(line.slice(3)) || 0;
    }
  }
  void statSync;
  return files;
}
