# Minimal Squire example

The smallest possible Squire app. Spawns Claude Code, sends one prompt, and streams `text_delta` events back to stdout.

## Prerequisites

- Node 20+
- Claude Code CLI on PATH (`claude --version` should resolve)

## How to run

```bash
npm install
npm start
```

You should see Claude's reply stream a token at a time, followed by `[exit 0]`.
