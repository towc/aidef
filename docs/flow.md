# AIDef Execution Flow

## Overview

AIDef operates in two distinct phases:

1. **Compilation Phase**: Parse `.aid` files → generate `.plan.aid` tree in `.aid-plan/`
2. **Build Phase**: Execute leaf nodes → generate code to `build/`

This separation allows developers to inspect the planned changes before committing to inference costs.

No database—files are the source of truth. Each submodule can run independently.

## File Types

| Extension | Format | Purpose |
|-----------|--------|---------|
| `.aid` | CSS-like | User source files (committed) |
| `.plan.aid` | CSS-like | Generated nodes (gitignored) |
| `.plan.aid.questions.json` | JSON | Questions (gitignored) |

**Note**: Context is passed in-memory from parent to child during compilation—there are no context files on disk.

## Phase 1: Compilation

### Entry Point

```bash
aid .
```

1. Look for `root.aid` in current directory
2. Resolve all `@imports` recursively
3. Parse CSS-like syntax, apply selectors
4. Generate `.aid-plan/` folder structure
5. Create `.plan.aid` and `.plan.aid.questions.json` files for each node

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
Resolved spec + parent context (in-memory)
    │
    ├── [Compilation Agent]
    │   Reads: spec + parent context (passed in-memory)
    │   Outputs:
    │     - node.plan.aid (resolved spec, CSS-like)
    │     - node.plan.aid.questions.json (questions, JSON)
    │   Passes: child context in-memory to children
    │
    └── [Parallel recursion into children]
```

### Context Flow

Context is passed **in-memory** from parent to child during compilation. This includes all information that might be relevant to children:

- Module path and ancestry
- Tags and metadata
- Interface definitions
- Constraints and rules
- Utility signatures and locations

Before generation, a **context filter agent** decides what subset is actually needed.

This in-memory approach:
- Enables true parallelization (no file I/O bottlenecks)
- Maintains agent isolation (children cannot read sibling context)
- Simplifies the output structure (only `.plan.aid` and `.plan.aid.questions.json` files)

### Sandboxing Rules

Each compilation agent:
- **CAN** read: Current spec, parent context (passed in-memory), explicitly referenced files
- **CANNOT** read: Other `.aid` files, sibling context, `.aid-plan/`, `build/`
- **Outputs**: Child `.plan.aid` + `.plan.aid.questions.json`
- **Passes**: Child context in-memory to children

### Uncertainty Handling

When an agent encounters ambiguity:
1. Log to `node.plan.aid.questions.json` (JSON format)
2. Continue with best-effort interpretation
3. User reviews via `--browse` or edits `.plan.aid.questions.json` directly

## Phase 2: Build

### Triggering Build

After compilation:
- Review the `.plan.aid` tree structure
- Answer questions in `.plan.aid.questions.json` files
- Run `aid . --build`

### Leaf Node Execution

```
node.plan.aid + context (in-memory)
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
2. **Compare**: New vs existing `.plan.aid` outputs
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
    - server/node.plan.aid
    - auth/node.plan.aid
  [3/4] Recursive compilation...
  [4/4] Done

Questions found:
  .aid-plan/auth/node.plan.aid.questions.json: session persistence?
  .aid-plan/server/api/node.plan.aid.questions.json: rate limits?

Run `aid . --browse` to review.
Run `aid . --build` to generate code.
```

### Browse Mode: `aid . --browse`

Interactive TUI:
- Watch compilation progress
- Browse `.plan.aid` tree
- View/answer `.plan.aid.questions.json` questions
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
├── .aid-plan/                   # Compilation output
│   ├── root.plan.aid               # Compiled root
│   ├── server/
│   │   ├── node.plan.aid           # CSS-like spec
│   │   ├── node.plan.aid.questions.json  # JSON questions
│   │   └── api/
│   │       └── node.plan.aid
│   └── auth/
│       ├── node.plan.aid
│       └── node.plan.aid.questions.json
└── build/                      # Generated code
    ├── server/
    │   └── api.ts
    └── auth/
        └── index.ts
```

Context is passed in-memory during compilation, so each `.plan.aid` file contains the full resolved spec. The build phase receives context in-memory as well.
