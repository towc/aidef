# AIDef Execution Flow

## Overview

AIDef operates in two distinct phases:

1. **Compilation Phase**: Parse `.aid` files, generate the task tree, produce child `.aid` files
2. **Build Phase**: Execute leaf nodes to generate actual code files

This separation allows developers to inspect the planned changes before committing to inference costs.

## Phase 1: Compilation

### Entry Point

```bash
aid .
```

1. Look for `root.aid` in current directory
2. If `.aid/` folder doesn't exist, create it
3. Copy `root.aid` to `.aid/node.aid` for internal consistency
4. Begin recursive compilation

### Node Processing

For each `.aid` file (starting with `root.aid`):

1. **Parse**: Extract natural language specification, directives, and file references
2. **Plan**: Determine the task graph:
   - Which tasks are sequential (dependencies)
   - Which tasks can run in parallel (independent)
3. **Output**: Generate text output describing:
   - Interfaces this node defines
   - Utility signatures and file paths
   - Context to pass to child nodes
4. **Spawn Children**:
   - **Leaf node** → create `./<task>.aid`
   - **Non-leaf node** → create `./<task>/node.aid`

### Sandboxing Rules

Each compilation agent:
- **CAN** read: The current `.aid` file, explicitly referenced config files (e.g., `.env`)
- **CANNOT** read: Other `.aid` files, `.aid/` folder contents, `build/` folder contents
- **Receives**: Text context passed from parent node (interfaces, signatures)
- **Outputs**: Text context for child nodes + the child `.aid` file contents

This enforces true isolation—nodes cannot "peek" at sibling implementations.

### Uncertainty Handling

When an agent encounters ambiguity:
1. Log the uncertainty to `.aiq` file in the current folder
2. Continue with best-effort interpretation
3. Mark affected outputs as potentially needing revision

`.aiq` files accumulate per-folder, allowing targeted review.

## Phase 2: Build

### Triggering Build

After compilation, the developer can:
- Review the `.aid` tree structure
- Answer questions in `.aiq` files
- Approve the build

Build is triggered explicitly (exact mechanism TBD—could be `aid . --build` or interactive confirmation).

### Leaf Node Execution

Each leaf `.aid` file:
1. Contains complete instructions for generating one or more code files
2. Has received all necessary context via parent chain
3. Outputs files to `./build/` relative to `root.aid`

### Parallel Execution

Since leaf nodes are isolated:
- Independent leaves execute simultaneously
- No shared mutable state
- Each leaf writes to distinct paths in `./build/`

## Re-compilation (Incremental Builds)

When `root.aid` or any `.aid` file is modified:

### Diffing Strategy

1. **New Compilation**: Generate proposed `.aid` files (without reading existing)
2. **Comparison Agent**: Compare new vs. existing `.aid` outputs
3. **Interface Check**: If interfaces are strictly identical → skip subtree
4. **Propagation**: Only affected branches are recompiled

### What Triggers Recompilation

- Interface changes (function signatures, data structures)
- New/removed child nodes
- Changed ordering constraints

### What Doesn't Trigger Recompilation

- Comment changes (in most cases)
- Suggestion changes that don't affect interface
- Internal implementation hints that don't cross boundaries

## CLI Modes

### Standard Mode: `aid .`

```
$ aid .
Compiling root.aid...
  [1/5] Parsing specification
  [2/5] Planning task graph
  [3/5] Generating child nodes
    - auth/node.aid (non-leaf)
    - config.aid (leaf)
    - api/node.aid (non-leaf)
  [4/5] Recursive compilation...
  [5/5] Done

Uncertainties found:
  .aid/auth/session.aiq: "Should sessions persist across restarts?"
  .aid/api/rate-limit.aiq: "What rate limits for unauthenticated requests?"

Run `aid . --browse` to review and answer questions.
Run `aid . --build` to generate code (3 leaf nodes ready).
```

### Browse Mode: `aid . --browse`

Interactive TUI that allows:
- Watching compilation progress in real-time
- Browsing the `.aid` tree structure
- Viewing and answering `.aiq` questions inline
- Aborting compilation early if something looks wrong
- Approving/triggering build phase

### Build Mode: `aid . --build`

Executes leaf nodes and generates code to `./build/`.

## Folder Structure After Compilation

```
project/
├── root.aid                    # User's source of truth
├── .env                        # Config (explicitly referenced)
├── .aid/                       # Compilation artifacts
│   ├── node.aid                # Copy of root.aid
│   ├── auth/
│   │   ├── node.aid            # Auth module specification
│   │   ├── session.aid         # Leaf: session handling
│   │   ├── session.aiq         # Questions about sessions
│   │   └── password.aid        # Leaf: password utilities
│   ├── config.aid              # Leaf: config loader
│   └── api/
│       ├── node.aid            # API module specification
│       ├── routes.aid          # Leaf: route definitions
│       └── rate-limit.aiq      # Questions about rate limiting
└── build/                      # Generated code (after build phase)
    ├── auth/
    │   ├── session.ts
    │   └── password.ts
    ├── config.ts
    └── api/
        └── routes.ts
```
