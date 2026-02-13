# AIDef Execution Flow

## Overview

AIDef operates in two distinct phases:

1. **Compilation Phase**: Parse `.aid` files, generate the task tree, produce child `.aid` + `.aidc` files
2. **Build Phase**: Execute leaf nodes to generate actual code files

This separation allows developers to inspect the planned changes before committing to inference costs.

No database—files are the source of truth. Each submodule can run independently.

## Phase 1: Compilation

### Entry Point

```bash
aid .
```

1. Look for `root.aid` in current directory
2. If `.aid/` folder doesn't exist, create it
3. Begin recursive compilation

### Node Processing

For each `.aid` file (starting with `root.aid`):

```
node.aid + node.aidc (if exists)
    │
    ├── [Context Filter Agent]
    │   Reads: node.aidc (all potentially relevant context)
    │   Outputs: Filtered context relevant for this generation
    │   Future: "Skills" system triggers rules based on keywords
    │
    ├── [Compilation Agent]
    │   Reads: node.aid + filtered context
    │   Outputs:
    │     - Child node.aid files (specs)
    │     - Child node.aidc files (full context for children)
    │     - node.aiq (uncertainties)
    │
    └── [Parallel recursion into children]
```

### Context Flow

The `.aidc` file contains **all context that might be relevant** to children:

```json
{
  "module": "auth",
  "ancestry": ["root", "server", "auth"],
  "interfaces": { ... },
  "constraints": [ ... ],
  "conventions": [ ... ],
  "utilities": [ ... ]
}
```

Before generation, a **context filter agent** decides what subset is actually needed. This keeps generation focused while preserving full context.

After generation, the compilation agent produces a new `.aidc` for each child, containing everything that *might* be relevant to grandchildren.

### Sandboxing Rules

Each compilation agent:
- **CAN** read: Current `node.aid`, current `node.aidc`, explicitly referenced files
- **CANNOT** read: Other `.aid` files, sibling `.aidc`, `.aid/` folder, `build/` folder
- **Outputs**: Child `node.aid` + child `node.aidc` + `node.aiq`

This enforces true isolation—nodes cannot "peek" at sibling implementations.

### Uncertainty Handling

When an agent encounters ambiguity:
1. Log the uncertainty to `node.aiq` in the current folder
2. Continue with best-effort interpretation
3. Mark affected outputs as potentially needing revision

`.aiq` files accumulate per-folder, allowing targeted review.

## Phase 2: Build

### Triggering Build

After compilation, the developer can:
- Review the `.aid` tree structure
- Answer questions in `.aiq` files
- Approve the build

Build is triggered with `aid . --build`.

### Leaf Node Execution

Each leaf node:

```
node.aid + node.aidc
    │
    ├── [Context Filter Agent]
    │   Same as compilation, but for code generation
    │
    ├── [Generation Agent]
    │   Reads: node.aid + filtered context
    │   Outputs: Code files to ./build/
    │
    └── [Post-Generation Checks] (TODO)
        Verify: outputs match declared interfaces
        Flag: deviations for review
```

### Parallel Execution

Everything runs in parallel:
- All siblings compile simultaneously
- All leaves build simultaneously
- No sequential dependencies (by design)

If you think you need ordering, you need better interface definitions instead.

## Re-compilation (Incremental Builds)

When `root.aid` or any `.aid` file is modified:

### Diffing Strategy

1. **New Compilation**: Generate proposed `.aid` + `.aidc` files
2. **Comparison Agent**: Compare new vs. existing outputs
3. **Interface Check**: If interfaces are strictly identical → skip subtree
4. **Propagation**: Only affected branches are recompiled

### What Triggers Recompilation

- Interface changes (function signatures, data structures)
- New/removed child nodes
- Constraint changes that affect children

### What Doesn't Trigger Recompilation

- Comment changes
- Suggestion changes that don't affect interface
- Internal implementation hints that don't cross boundaries

## CLI Modes

### Standard Mode: `aid .`

```
$ aid .
Compiling root.aid...
  [1/4] Parsing specification
  [2/4] Generating child nodes
    - auth/node.aid + node.aidc
    - config/node.aid + node.aidc (leaf)
    - api/node.aid + node.aidc
  [3/4] Recursive compilation...
  [4/4] Done

Uncertainties found:
  .aid/auth/node.aiq: "Should sessions persist across restarts?"
  .aid/api/node.aiq: "What rate limits for unauthenticated requests?"

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

### Estimate Mode: `aid . --estimate`

Shows cost estimate before running:
- Count nodes to compile
- Estimate tokens
- Abort if exceeds `--max-cost` threshold

## Folder Structure After Compilation

```
project/
├── root.aid                    # User's source of truth
├── .env                        # Config (explicitly referenced)
├── .aid/                       # Compilation artifacts
│   ├── auth/
│   │   ├── node.aid            # Auth module spec
│   │   ├── node.aidc           # Context from parent (JSON)
│   │   ├── node.aiq            # Questions about auth
│   │   └── session/
│   │       ├── node.aid        # Session submodule spec
│   │       ├── node.aidc       # Context from auth (JSON)
│   │       └── node.aiq        # Questions about sessions
│   ├── config/
│   │   ├── node.aid            # Leaf spec
│   │   └── node.aidc           # Context from root
│   └── api/
│       ├── node.aid            # API module spec
│       ├── node.aidc           # Context from root
│       ├── node.aiq            # Questions about API
│       └── routes/
│           ├── node.aid        # Leaf spec
│           └── node.aidc       # Context from API
└── build/                      # Generated code (after build phase)
    ├── auth/
    │   └── session.ts
    ├── config.ts
    └── api/
        └── routes.ts
```

Each submodule folder contains everything needed to run independently:
- `node.aid` - The specification
- `node.aidc` - Full context from ancestors
- `node.aiq` - Outstanding questions (if any)
