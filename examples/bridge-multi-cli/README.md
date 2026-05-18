# Multi-CLI bridge example

Shows Squire's core differentiator: spawning more than one CLI agent from the same Node process and treating them as peers.

## What it does

1. Spawns Claude Code, asks it to name a strength of subprocess-based agent runtimes.
2. Captures Claude's reply.
3. Spawns Gemini CLI with Claude's reply embedded as context, asks for a counterpoint.
4. Prints both replies side by side.

Use case: any agent runtime that wants to route different prompts to different vendors (cost, capability, or fallback). Squire handles spawn quirks and event streaming for both CLIs through one API.

## Prerequisites

- Node 20+
- Claude Code CLI on PATH (`claude --version`)
- Gemini CLI on PATH (`gemini --version`)

Both CLIs must already be authenticated on the machine you run this on. Squire only spawns the child process; it does not handle login.

## How to run

```bash
npm install
npm start
```

You should see Claude's reply stream first, then Gemini's reply stream, followed by a summary block.
