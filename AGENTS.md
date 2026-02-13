# AIDef - Agent Instructions

## Project Overview

AIDef is a procedural engineering tool that replaces ephemeral AI chat threads with a recursive instruction tree. Instead of conversational AI coding, developers maintain `.aid` files as a source of truth.

**Repository**: https://github.com/towc/aidef (private)
**Website**: aidef.dev (planned)
**Runtime**: Bun
**Language**: TypeScript
**Status**: Pre-release. No backwards compatibility guarantees.

## Documentation

Read these docs to understand the project architecture:

| Document | Purpose |
|----------|---------|
| `docs/philosophy.md` | Core concepts, design rationale, terminology, trade-offs |
| `docs/flow.md` | Compilation and build phase execution flow |
| `docs/performance.md` | Parallelization, caching, cost optimization |
| `docs/file-formats.md` | `.aid`, `.plan.aid`, `.plan.aid.questions.json` specifications |
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
├── .aid-plan/         # Generated compilation output (gitignored)
└── build/            # Generated code (gitignored)
```

## Terminology

AIDef uses compiler terminology. See `docs/philosophy.md` for full details.

| Term | Meaning |
|------|---------|
| **Source Code** | Human-written `.aid` files |
| **Execution Plan** | The compiled `.plan.aid` tree (like a SQL query plan) |
| **Plan Node** | A single `.plan.aid` file in the execution plan |
| **Generator Node** | A leaf plan node that writes files |
| **Generated Code** | The final output in `build/` |
| **Compiler/Planner** | Creates the execution plan from source |
| **Runtime/Executor** | Executes the plan (AI generates code) |

## Key Concepts

### Two-Phase Architecture
1. **Compilation**: Parse `.aid` (source) → generate execution plan (`.plan.aid` tree) in `.aid-plan/`
2. **Build**: Execute plan via runtime → generate code to `./build/`

### File Types
| Extension | Format | Purpose |
|-----------|--------|---------|
| `.aid` | nginx-like | Source code (committed) |
| `.plan.aid` | nginx-like | Plan nodes (gitignored) |
| `.plan.aid.map` | JSON | Source maps for traceability |
| `.plan.aid.questions.json` | JSON | Questions for human review |

### Agent Isolation
- Agents CANNOT read: sibling `.plan.aid`, `.aid-plan/` folder, `build/` folder
- Context passed in-memory from parent to child (not via files)
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

Phase: **Build Phase Implementation** (Phase 8)

Completed: Parser, CLI, Providers, Compilation (single + recursive), Context model, Caching

Current focus: Code generation from leaf nodes (see `docs/todos.md`)

### Implementation Order
1. ~~Define interfaces first (enables parallel work)~~
2. ~~Parser: lexer → AST → imports~~
3. ~~CLI skeleton~~
4. ~~Provider abstraction (Anthropic + OpenAI)~~
5. ~~Single-node compilation~~
6. ~~Recursive compilation with parallelization~~
7. ~~Context model refactor (encapsulation)~~
8. ~~Caching & diffing~~
9. **Build phase (code generation)** ← current
10. TUI (`--browse` mode)
11. Analysis & suggestions

### Testing Strategy
- Unit tests: Parser, deterministic components (mock AI)
- Structure tests: Validate output shape
- Snapshot tests: Catch unintended changes
- Integration tests: Real AI calls (periodic)

### Backwards Compatibility

**None guaranteed.** This is a pre-release project. We can make sweeping changes to:
- File formats (`.aid`, `.plan.aid`, etc.)
- CLI interface
- Internal APIs
- Directory structure

Do not add deprecation markers. Just change things directly.
