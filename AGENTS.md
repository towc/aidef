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
| `docs/file-formats.md` | `.aid`, `.aidg`, `.aidc`, `.aidq` specifications |
| `docs/isolation.md` | Agent sandboxing and context passing |
| `docs/todos.md` | Implementation phases, decisions, interfaces |

**Session instruction**: If you create new documentation files, add them to this table and briefly describe their purpose.

## Directory Structure

```
aidef/
├── src/
│   ├── parser/       # Lexer, AST, import resolution
│   ├── compiler/     # Node compilation, context building
│   ├── generator/    # Code generation from leaf nodes
│   ├── providers/    # LLM provider adapters
│   └── cli/          # CLI interface, TUI for --browse mode
├── docs/             # Project documentation
├── examples/         # Sample .aid files
├── root.aid          # AIDef's own spec (meta)
├── .aid-gen/         # Generated compilation output (gitignored)
└── build/            # Generated code (gitignored)
```

## Key Concepts

### Two-Phase Architecture
1. **Compilation**: Parse `.aid` → generate `.aidg` tree in `.aid-gen/`
2. **Build**: Execute leaf nodes → generate code to `./build/`

### File Types
| Extension | Format | Purpose |
|-----------|--------|---------|
| `.aid` | CSS-like | User source files (committed) |
| `.aidg` | CSS-like | Generated nodes (gitignored) |
| `.aidc` | YAML | Context for nodes (gitignored) |
| `.aidq` | YAML | Questions (gitignored) |

### Agent Isolation
- Agents CANNOT read: sibling `.aidg`, `.aid-gen/` folder, `build/` folder
- Context passed via `.aidc` files (YAML)
- Enables true parallelization

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
- **ALWAYS** define interfaces before implementation (enables parallelization)

## Bun Usage

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <package>` instead of `npx <package>`
- Bun automatically loads .env, so don't use dotenv.

### Bun APIs

- `Bun.serve()` for HTTP. Don't use `express`.
- `Bun.file()` for file I/O. Prefer over `node:fs`.
- `Bun.$\`cmd\`` for shell commands. Don't use `execa`.
- `bun:sqlite` for SQLite if needed.

### Testing

Use `bun test` to run tests.

```ts
import { test, expect, describe } from "bun:test";

describe("parser", () => {
  test("tokenizes identifiers", () => {
    const tokens = tokenize("server { }");
    expect(tokens[0].type).toBe("identifier");
  });
});
```

## Code Style

- TypeScript strict mode
- Prefer functional patterns where appropriate
- Keep functions small and focused
- Document public interfaces with JSDoc
- Use descriptive variable names
- Export interfaces separately from implementations

## Current Development Status

Phase: **MVP Foundation**

Current focus: Parser implementation (see `docs/todos.md` Phase 1)

### Implementation Order
1. Define interfaces first (enables parallel work)
2. Parser: lexer → AST → imports → selectors
3. CLI skeleton
4. Provider abstraction (Anthropic first)
5. Single-node compilation
6. Recursive compilation with parallelization

### Testing Strategy
- Unit tests: Parser, deterministic components (mock AI)
- Structure tests: Validate output shape
- Snapshot tests: Catch unintended changes
- Integration tests: Real AI calls (periodic)
