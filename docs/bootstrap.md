# AIDef Bootstrap & Iterative Development

## The Self-Hosting Problem

AIDef compiles `.aid` specs into code. AIDef itself is defined in `.aid` specs. This creates a chicken-and-egg problem: we need a working compiler to compile the compiler.

## Solution: Iterative Bootstrapping

We maintain a **working build** that can compile `.aid` files. Each iteration:

1. **Edit `.aid` specs** - change the source of truth
2. **Compile** - use the current working build to compile the updated specs
3. **Build** - run the compiled plan to generate code via LLM
4. **Fix** - manually patch any generated code issues
5. **Test** - verify the new build works (CLI, compile, run, extract)
6. **Promote** - if it works, this becomes the new working build

```
.aid files ──► working build (compile) ──► plan ──► working build (run) ──► generated code
                    ▲                                                            │
                    │                    fix + test                              │
                    └───────────────────────────────────────────────────────────┘
```

## Working Build Location

The working build lives in `src/` and is committed to git. It's a mix of:
- **Generated code** from previous compile+build cycles
- **Manual patches** to fix LLM-generated issues
- **Bootstrap code** from the original hand-written implementation

Over time, the proportion of generated vs hand-written code should increase as the specs and prompts improve.

## Build Output Location

Each compile produces output in `/tmp/aidef-<timestamp>/`. The structure is:

```
/tmp/aidef-<timestamp>/
├── root.resolved.aid          # Resolved spec (includes inlined)
├── compile.log.jsonl          # Compilation log
├── compiler/                  # Compiler node + child leaves
│   ├── node.gen.aid
│   ├── parser/leaf.gen.aid.leaf.json
│   ├── resolver/leaf.gen.aid.leaf.json
│   └── ...
├── runtime/                   # Runtime node + child leaves
├── extract/                   # Extract node + child leaves
├── cli/                       # CLI node + child leaves
└── src/                       # Generated code (after `run`)
    ├── index.ts
    ├── compiler/
    ├── runtime/
    └── extract/
```

## Common Issues in Generated Code

The LLM frequently produces these errors that need manual patching:

| Issue | Symptom | Fix |
|-------|---------|-----|
| Ambient declarations | `export const X: Type;` without value | Remove the declaration, just use imports |
| Missing `async` | `function f(): Promise<void>` without `async` | Add `async` keyword |
| Wrong Bun APIs | `Bun.mkdir()` (doesn't exist) | Use `fs.mkdirSync()` from `node:fs` |
| Import redeclaration | Import `Foo` then also `interface Foo {}` | Remove the local redeclaration |
| Syntax errors | Mismatched brackets in tool configs | Fix bracket nesting manually |
| Missing files | LLM returns text instead of tool call | Retry logic nudges LLM to use tools |
| Escaped strings | `\\n` instead of `\n` in regex | Fix escaping |

These are tracked and fed back into the `.aid` specs as explicit rules (see the `CRITICAL CODE GENERATION RULES` sections in `compiler.aid` and `runtime.aid`).

## Promoting a Build

When a build in `/tmp/aidef-<timestamp>/src/` passes testing:

1. Copy generated files over `src/` (preserving `.git`)
2. Apply any manual patches
3. Test: `bun src/index.ts --help`
4. Test: `bun src/index.ts compile root.aid -o /tmp/test`
5. Test: `bun src/index.ts run -o /tmp/test`
6. Commit

It's acceptable to cherry-pick: copy only the modules that improved, keeping bootstrap code for modules that regressed.

## Current State

The working build in `src/` uses:
- **Bootstrap compiler** (`src/compiler/`) - mostly hand-written, proven reliable
- **Bootstrap runtime** (`src/runtime/`) - hand-written, has retry logic for missing files
- **Generated extract** (`src/extract/`) - LLM-generated, first iteration
- **Hand-written CLI** (`src/index.ts`) - manually maintained entry point

The compiler and runtime are the hardest to self-host because:
- `gen.ts` is the most complex module (multi-pass LLM compilation with tool calling)
- The runtime needs to correctly handle LLM function calling, retries, and file I/O
- Both modules define how the LLM should behave, creating a meta-level complexity

## Development Workflow

```bash
# 1. Edit .aid specs
vim compiler.aid  # or runtime.aid, extract.aid, root.aid

# 2. Compile with current working build
bun src/index.ts compile root.aid -o /tmp/aidef-new

# 3. Build (generate code from leaves)
bun src/index.ts run -o /tmp/aidef-new

# 4. Install deps in output
cd /tmp/aidef-new && bun add commander @google/genai

# 5. Test
bun src/index.ts --help
bun src/index.ts compile root.aid -o /tmp/aidef-test

# 6. If it works, promote
cp -r /tmp/aidef-new/src/* /path/to/repo/src/
# Apply patches if needed
# Commit
```

## Goal

Full self-hosting: the generated code should compile itself without manual patches. We're not there yet, but each iteration improves the specs and reduces the patch surface.
