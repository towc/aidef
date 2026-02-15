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

## Build Iteration Flow

Each self-hosting iteration follows this cycle:

1. **Edit .aid specs** - Update root.aid, compiler.aid, runtime.aid, etc. with improvements
2. **Compile** - `bun src/index.ts compile root.aid -o /tmp/aidef-genN --max-parallel 100`
   - Three-pass compilation: Planning → Interface Definition → Child Generation
   - Produces .leaf.json files in the output directory
3. **Build** - `bun src/index.ts run -o /tmp/aidef-genN --max-parallel 5`
   - Executes all leaves in parallel (use lower parallelism to avoid rate limits)
   - Each leaf generates code via LLM tool calling
   - Rate limit retries: 429 errors are retried with backoff
4. **Verify** (parallel subagents) - Check all generated files for common issues:
   - Ambient declarations (export without body)
   - Import redeclaration (importing AND locally declaring same thing)
   - Missing async on Promise-returning functions
   - Wrong Bun APIs (Bun.mkdir, Bun.write with append)
   - response.text() called as function (should be property)
   - Escaped regex strings (\\n instead of \n)
   - Missing files (leaves that failed due to rate limits)
5. **Patch** - Fix issues found in verification (manual or via subagents)
6. **Test** - `bun /tmp/aidef-genN/src/index.ts --help` to verify CLI works
7. **Promote** - Copy generated src/ to repo's src/, commit
8. **Repeat** - Each cycle should reduce manual patches needed

### Rate Limit Management

Gemini 2.5 Flash limits: 1M tokens/min, 1K requests/min.
- Compilation (3-pass) uses ~3x more tokens per node than single-pass
- 19 parallel leaf generations can exceed 1M tokens/min
- Use `--max-parallel 5` for build phase, `--max-parallel 100` for compile phase
- Use `--tokens-per-minute` and `--requests-per-minute` for proactive throttling
- Runtime retries 429 errors with parsed delay + 5s buffer, up to 5 attempts

### Known Generation Issues (checklist for verification)

These are recurring LLM code generation problems to check after each build:

1. Ambient declarations: `export const X: Type;` or `export function f(): void;` with no body
2. Import redeclaration: importing AND locally re-declaring the same interface/type/class
3. Missing async: functions returning Promise without async keyword
4. Wrong Bun APIs: `Bun.mkdir()` (doesn't exist), `Bun.write(path, content, { append: true })` (append not supported)
5. response.text() as function: in @google/genai, text is a property not a method
6. Escaped regex strings: `\\n` instead of `\n`, `\\s` instead of `\s`
7. Architectural divergence: generated gen.ts inventing LEAF_CONFIG approach instead of .leaf.json
8. Parser regression: brace counting only on exact `{`/`}` lines instead of all braces
9. Missing files: leaves that hit rate limits and produced no output

## Goal

Full self-hosting: the generated code should compile itself without manual patches. We're not there yet, but each iteration improves the specs and reduces the patch surface.
