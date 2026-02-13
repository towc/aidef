# AIDef Execution Flow

## Overview

AIDef operates in two distinct phases:

1. **Compilation Phase**: Parse `.aid` files → generate `.aidg` tree in `.aid-gen/`
2. **Build Phase**: Execute leaf nodes → generate code to `build/`

This separation allows developers to inspect the planned changes before committing to inference costs.

No database—files are the source of truth. Each submodule can run independently.

## File Types

| Extension | Format | Purpose |
|-----------|--------|---------|
| `.aid` | CSS-like | User source files (committed) |
| `.aidg` | CSS-like | Generated nodes (gitignored) |
| `.aidc` | YAML | Context for nodes (gitignored) |
| `.aidq` | YAML | Questions (gitignored) |

## Phase 1: Compilation

### Entry Point

```bash
aid .
```

1. Look for `root.aid` in current directory
2. Resolve all `@imports` recursively
3. Parse CSS-like syntax, apply selectors
4. Generate `.aid-gen/` folder structure
5. Create `.aidg`, `.aidc`, `.aidq` files for each node

### Import Resolution

Before compilation, all imports are resolved:

```aid
// root.aid
@server           // pulls in ./server.aid
@./auth           // pulls in ./auth.aid

server {
  @./server-db    // scoped import
}
```

Imports are pure text substitution. The result is a single resolved tree.

### Node Processing

For each node in the resolved tree:

```
Resolved spec
    │
    ├── [Compilation Agent]
    │   Reads: spec + parent's .aidc (if exists)
    │   Outputs:
    │     - node.aidg (resolved spec, CSS-like)
    │     - node.aidc (context for children, YAML)
    │     - node.aidq (questions, YAML)
    │
    └── [Parallel recursion into children]
```

### Context Flow

The `.aidc` file contains **all context that might be relevant** to children:

```yaml
module: server.api
ancestry: [root, server, api]
tags: [api, http]

interfaces:
  ApiResponse:
    source: root
    definition: "..."

constraints:
  - rule: TypeScript strict mode
    source: root
    important: true

utilities:
  - name: validateRequest
    signature: "..."
    location: utils/validate.ts
```

Before generation, a **context filter agent** decides what subset is actually needed.

### Sandboxing Rules

Each compilation agent:
- **CAN** read: Current spec, current `.aidc`, explicitly referenced files
- **CANNOT** read: Other `.aid` files, sibling `.aidc`, `.aid-gen/`, `build/`
- **Outputs**: Child `.aidg` + child `.aidc` + `.aidq`

### Uncertainty Handling

When an agent encounters ambiguity:
1. Log to `node.aidq` (YAML format)
2. Continue with best-effort interpretation
3. User reviews via `--browse` or edits `.aidq` directly

## Phase 2: Build

### Triggering Build

After compilation:
- Review the `.aidg` tree structure
- Answer questions in `.aidq` files
- Run `aid . --build`

### Leaf Node Execution

```
node.aidg + node.aidc
    │
    ├── [Context Filter Agent]
    │   Selects relevant subset of context
    │
    ├── [Generation Agent]
    │   Outputs: Code files to ./build/
    │
    └── [Post-Generation Checks] (TODO)
        Verify outputs match declared interfaces
```

### Parallel Execution

Everything runs in parallel:
- All siblings compile simultaneously
- All leaves build simultaneously
- No sequential dependencies

## Re-compilation (Incremental Builds)

### Diffing Strategy

1. **Resolve imports**: Get new resolved tree
2. **Compare**: New vs existing `.aidg` outputs
3. **Interface check**: If identical → skip subtree
4. **Propagation**: Only affected branches recompile

### What Triggers Recompilation

- Interface changes
- New/removed child nodes
- Constraint changes

### What Doesn't Trigger Recompilation

- Comment changes
- Suggestion changes that don't affect interface
- Internal hints that don't cross boundaries

## CLI Modes

### Standard Mode: `aid .`

```
$ aid .
Resolving imports...
Compiling root.aid...
  [1/4] Parsing specification
  [2/4] Generating child nodes
    - server/node.aidg + node.aidc
    - auth/node.aidg + node.aidc
  [3/4] Recursive compilation...
  [4/4] Done

Questions found:
  .aid-gen/auth/node.aidq: session persistence?
  .aid-gen/server/api/node.aidq: rate limits?

Run `aid . --browse` to review.
Run `aid . --build` to generate code.
```

### Browse Mode: `aid . --browse`

Interactive TUI:
- Watch compilation progress
- Browse `.aidg` tree
- View/answer `.aidq` questions
- Abort early if needed
- Trigger build

### Build Mode: `aid . --build`

Execute leaf nodes → generate code to `./build/`.

### Estimate Mode: `aid . --estimate`

Show cost estimate before running.

## Folder Structure

### User Files (Committed)

```
project/
├── root.aid                    # Entry point
├── server.aid                  # Module definition
├── auth.aid                    # Module definition
└── src/                        # Organize like code
    ├── api.aid
    └── models.aid
```

### Generated Files (Gitignored)

```
project/
├── .aid-gen/                   # Compilation output
│   ├── root.aidg               # Compiled root
│   ├── server/
│   │   ├── node.aidg           # CSS-like spec
│   │   ├── node.aidc           # YAML context
│   │   ├── node.aidq           # YAML questions
│   │   └── api/
│   │       ├── node.aidg
│   │       └── node.aidc
│   └── auth/
│       ├── node.aidg
│       ├── node.aidc
│       └── node.aidq
└── build/                      # Generated code
    ├── server/
    │   └── api.ts
    └── auth/
        └── index.ts
```

Each folder in `.aid-gen/` is independently runnable with its `node.aidg` + `node.aidc`.
