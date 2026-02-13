# AIDef - Agent Instructions

## Project Overview

AIDef is a procedural engineering tool that replaces ephemeral AI chat threads with a recursive instruction tree. Instead of conversational AI coding, developers maintain `.aid` files as a source of truth.

**Repository**: https://github.com/towc/aidef (private)
**Website**: aidef.dev (planned)
**Runtime**: Bun
**Language**: TypeScript

## Documentation

Read these docs to understand the project architecture:

| Document | Purpose |
|----------|---------|
| `docs/philosophy.md` | Core concepts, design rationale, trade-offs |
| `docs/flow.md` | Compilation and build phase execution flow |
| `docs/performance.md` | Parallelization, caching, cost optimization |
| `docs/file-formats.md` | `.aid` and `.aiq` file specifications |
| `docs/isolation.md` | Agent sandboxing and context passing |

**Session instruction**: If you create new documentation files, add them to this table and briefly describe their purpose.

## Directory Structure

```
aidef/
├── src/
│   ├── compiler/     # Parses .aid files, calculates diffs, generates tree
│   ├── tree/         # Manages recursive node structure
│   └── cli/          # CLI interface, TUI for --browse mode
├── docs/             # Project documentation
├── examples/         # Sample .aid files
├── build/            # Generated output (gitignored)
└── .aid/             # Compilation artifacts (gitignored)
```

## Key Concepts

### Two-Phase Architecture
1. **Compilation**: Parse `root.aid` → generate `.aid` tree (no code files yet)
2. **Build**: Execute leaf nodes → generate code to `./build/`

### Agent Isolation
- Build agents CANNOT read: other `.aid` files, `.aid/` folder, `build/` folder
- Context passed explicitly from parent → child as text (interfaces, signatures)
- This enables true parallelization

### File Types
- `root.aid` - User's source of truth (committed)
- `.aid/*.aid` - Compilation artifacts (not committed)
- `.aiq` - Questions/uncertainties (per-folder)
- `build/*` - Generated code (not committed)

## Session Rules

### NEVER Do These

- **NEVER** use `git checkout`, `git stash`, or `git revert`
  - Multiple instances may run in parallel
  - We cannot risk losing progress
- **NEVER** "simplify" by deviating from the documented plan without asking
- **NEVER** make destructive changes without explicit user approval

### ALWAYS Do These

- **ALWAYS** ask before destructive operations
- **ALWAYS** ask before deviating from documented architecture
- **ALWAYS** update `AGENTS.md` when adding new doc files
- **ALWAYS** keep documentation in sync with implementation

## Bun Usage

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

### Bun APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- `Bun.$\`ls\`` instead of execa.

### Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";

test("example", () => {
  expect(1).toBe(1);
});
```

## Code Style

- TypeScript strict mode
- Prefer functional patterns where appropriate
- Keep functions small and focused
- Document public interfaces
- Use descriptive variable names

## Current Development Status

Phase: **Documentation & Planning**

We are establishing the documentation and architecture before writing implementation code. Do not write implementation code until explicitly instructed.
