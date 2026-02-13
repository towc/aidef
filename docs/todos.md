# AIDef Implementation TODOs

## Terminology

See `docs/philosophy.md` for full terminology. Quick reference:

| Term | Meaning |
|------|---------|
| **Source Code** | Human-written `.aid` files |
| **Execution Plan** | The compiled `.plan.aid` tree |
| **Plan Node** | A single `.plan.aid` file |
| **Generator Node** | A leaf plan node (writes files) |
| **Generated Code** | Output in `build/` |
| **Compiler/Planner** | Creates execution plan from source |
| **Runtime/Executor** | Executes plan via AI |

## Current State

The MVP foundation is complete. All core components work with nginx-like syntax.

### Completed Phases

#### Phase 1: Parser ✅
- [x] Lexer: identifiers, braces, strings, numbers, semicolons, equals, include keyword
- [x] Comments: `/* */` and `//` (stripped from output)
- [x] Code blocks: ``` (preserved as literal prose)
- [x] Line/column tracking for error messages
- [x] AST: module blocks `name { }`, query filters `"question?" { }`, parameters, prose
- [x] Import resolution: `include ./path;` with cycle detection
- [x] Smart `include` detection (allows "include" in prose)

#### Phase 2: CLI Skeleton ✅
- [x] `aid` - entry point, finds root.aid in current directory
- [x] `aid --help` - usage info
- [x] `aid --auth` - LLM provider configuration (stub TUI)
- [x] `aid --browse` - stub (prints "not implemented")
- [x] `aid --build` - stub
- [x] `aid --estimate` - stub
- [x] `aid --verbose` - debug output

#### Phase 3: Provider Abstraction ✅
- [x] Provider interface definition
- [x] Anthropic adapter via Vercel AI SDK
- [x] OpenAI adapter via Vercel AI SDK
- [x] Config loading: env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)
- [x] Connection testing
- [x] Call logging to `.aid-gen/calls.jsonl`

#### Phase 4: Single-Node Compilation ✅
- [x] Compile one node with provider
- [x] Generate `.plan.aid` output
- [x] Generate `.plan.aid.questions.json` output (YAML) for questions
- [x] Write to `.aid-gen/`

#### Phase 5: Recursive Compilation ✅
- [x] Walk tree, compile each node
- [x] Parallel execution of siblings
- [x] Progress reporting

#### Phase 7: Diffing & Caching ✅
- [x] Content hashing (SHA-256)
- [x] Context hashing for cache invalidation
- [x] Skip unchanged nodes
- [x] Cache metadata in context

#### Phase 6: Context Model Refactor ✅
- [x] Remove `.aidc` concept (context passed in-memory)
- [x] Add `ChildContext` to `ChildSpec`
- [x] Add source maps (`.plan.aid.map`)
- [x] Remove `writeAidcFile` / `readAidcFile`
- [x] Pass context in-memory from parent to child
- [x] Store cache metadata in source maps
- [x] Update tests for new model

---

#### Phase 8: Build Phase (Code Generation) ✅
- [x] Implement `executeGenerator()` - AI generates code from leaf spec
- [x] Leaf node discovery via `.plan.aid.context.json` marker files
- [x] Write generated files to `build/`
- [x] Add source comment header to generated files (traceability)
- [x] Parallel execution of independent generators
- [x] Progress reporting during build phase
- [x] Handle generation failures gracefully
- [x] CLI `--build` command integration

---

## Current Phase: TUI

### Phase 9: TUI (`--browse`) - Current
- [ ] Tree view of `.aid-gen/` structure
- [ ] View node content
- [ ] View/answer `.plan.aid.questions.json` questions
- [ ] View `.aids` suggestions for each module
- [ ] Apply suggestions
- [ ] Trigger build
- [ ] Abort compilation

### Phase 10: Analysis & Suggestions (`--analyze`)
- [ ] `aid --analyze` command to analyze compiled structure
- [ ] Generate `.aids` files (AI suggestions) for optimization
- [ ] Analyze AI thought process from `calls.jsonl`

### Phase 11: Polish
- [ ] `--estimate` implementation
- [ ] Better error messages
- [ ] Documentation site
- [ ] npm/bun package publishing

---

## Context Model (Implemented)

Context flows **strictly parent → child**. Parent acts as context gateway.

```
Parent compiles:
  - Decides what EACH child needs
  - Passes context IN-MEMORY (not via file)
  - Can instruct child to forward utilities to grandchildren

Child compiles:
  - Receives ONLY what parent passed
  - Has no access to grandparent details (encapsulated)
```

### ChildContext Interface

```typescript
interface ChildContext {
  interfaces: Record<string, { definition: string; source: string }>;
  constraints: Array<{ rule: string; source: string }>;
  utilities: Array<{ name: string; signature: string; location: string }>;
  forwarding?: { utilities: string[] };
}
```

### File Structure

| File | Purpose |
|------|---------|
| `.plan.aid` | Plan node spec (human-readable) |
| `.plan.aid.map` | Source map + cache metadata |
| `.plan.aid.questions.json` | Questions for human review |
| `.aids` | Suggestions (future) |

---

## Syntax Reference (nginx-like)

### Hardcoded Patterns
| Pattern | Meaning |
|---------|---------|
| `name { }` | Module block |
| `"question?" { }` | Query filter block (LLM-evaluated) |
| `include ./path;` | Import file |
| `/* */` | Block comment |
| `//` | Line comment |
| `;` | Statement terminator |

### Parameters
Inside blocks: `param="value";` or `param=123;`

Recognized parameters:
- `leaf="reason"` - don't subdivide this module
- `never="reason"` - forbid this submodule  
- `optional="reason"` - may be skipped
- `priority=1` - compilation order (lower first)
- `path="./src"` - output path override
- `model="opus"` - LLM model override

### Example
```
server {
  A REST API server.
  
  Interfaces:
  ```typescript
  interface Handler {
    handle(req: Request): Response;
  }
  ```
  
  The handlers submodule implements Handler.
  Give it the logger utility.
  Forward logger to its children.
  
  handlers {
    leaf=true;
    Implement request handlers.
  }
}
```

---

## Design Decisions

### LLM Provider
Using **Vercel AI SDK** (`ai` package) with `@ai-sdk/*` providers.

### Encapsulation Model
Parent → Child context passing. No accumulation. See `docs/isolation.md`.

### Interface-Driven
Compiler LLM is prompted to:
1. Extract/design interfaces first
2. Spawn children with explicit context
3. Enable parallelization through clear contracts

### Submodule Placement
Submodules don't have to be direct children—they can exist anywhere in the subtree with the same semantic meaning. Generator has flexibility.

---

## Testing Strategy

```bash
bun test              # unit + integration (176 tests)
bun test tests/e2e    # real AI calls (manual)
```
