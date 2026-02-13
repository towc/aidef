# AIDef

**A programming language where AI is the runtime.**

AIDef replaces ephemeral AI chat threads with a recursive instruction tree. Instead of writing one-time messages that modify code, you write persistent `.aid` files that **are** your source of truth.

## The Idea

Programming languages have always been about abstraction:

```
Machine code → Assembly → Bytecode → High-level languages → .aid
```

Each step is a more expressive way to write instructions that compile to the layer below. `.aid` is simply the next evolution—code that compiles to code.

The `.aid` file is your source code. The AI is your compiler. The generated code in `build/` is like object files—inspect them, but edit the `.aid`.

## Why Not Chat?

| Chat Thread | AIDef |
|-------------|-------|
| Context lost between sessions | Context in version-controlled files |
| Single long thread, context window issues | Many short-lived sessions, scoped context |
| Sequential execution | Heavily parallelized |
| "Can you also..." modifications | Edit the spec, re-run |
| AI tends toward monoliths | Modularity enforced by architecture |

## Quick Example

Plain English works:

```aid
A REST API for user management. TypeScript, strict mode.

Use Zod for validation - this is required.
Prisma for database access would be nice.

The auth system should be its own module (login, sessions, etc).
Users module handles CRUD.
Config is just a simple file to load env vars.
```

Or use optional CSS-like syntax for structure (set `filetype=css` for editor support):

```aid
// REST API for user management

TypeScript strict mode !important
Zod for validation !important
Prisma for database access would be nice.

auth {
  login, logout, sessions
}

users {
  CRUD operations
}

config {
  load env vars
}
```

Import other `.aid` files:

```aid
@./core-requirements
@./shared-conventions

server {
  @./server-config
  REST endpoints
}
```

Run:
```bash
aid .
```

AIDef compiles to `.aid-gen/` with `.plan.aid` files. Inspect, approve, then build.

## How It Works

1. **Compilation**: Parse `root.aid` → generate `.plan.aid` tree in `.aid-gen/`
2. **Review**: Inspect the tree, answer questions in `.plan.aid.questions.json` files
3. **Build**: Execute leaf nodes → generate code to `build/`

Each node is isolated—can't read siblings, receives context in-memory from parent. This enables true parallelization and enforces modularity.

## Installation

```bash
bun install -g aidef
```

## Usage

```bash
aid .              # Compile .aid tree
aid . --browse     # Interactive TUI
aid . --build      # Generate code
aid . --estimate   # Cost estimate
aid . --auth       # Configure LLM providers
```

## LLM Providers

AIDef works with any LLM provider:
- OpenAI, Anthropic, Google
- Local models via Ollama
- OpenRouter, Together, etc.

Configure with `aid . --auth` or via environment variables.

## Documentation

- [Philosophy](docs/philosophy.md) - Core concepts, the "programming language for AI" idea
- [Execution Flow](docs/flow.md) - Compilation and build phases
- [Performance](docs/performance.md) - Parallelization and caching
- [File Formats](docs/file-formats.md) - `.aid`, `.plan.aid`, `.plan.aid.questions.json` specifications
- [Isolation](docs/isolation.md) - Agent sandboxing

## Status

**Phase: Documentation & Planning**

Architecture is being finalized. See [AGENTS.md](AGENTS.md) for contributor guidelines.

## License

MIT
