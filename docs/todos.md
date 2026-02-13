# AIDef Implementation TODOs

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
- [x] Generate `.aidg` output
- [x] Generate `.aidq` output (YAML) for questions
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

---

## Current Phase: Context Encapsulation

### Phase 6: Context Model Refactor (Current)

**The Problem**: Current model accumulates ALL ancestor context in `.aidc` files. This is wrong—context should flow strictly parent → child with explicit passing.

**The Solution**: Parent acts as context gateway, deciding what each child receives.

#### Tasks

- [ ] **Update types**
  - [ ] Remove `.aidc` concept (context passed in-memory)
  - [ ] Add `ChildContext` to `ChildSpec` (what parent passes to child)
  - [ ] Remove `suggestions` from context (that's `.aids`)
  - [ ] Remove accumulated fields (tags, conventions, etc.)

- [ ] **Add source maps**
  - [ ] Create `.aidg.map` file format (follow JS source map convention)
  - [ ] Track which `.aid` file each line came from
  - [ ] Write source maps during compilation

- [ ] **Update compiler**
  - [ ] Remove `writeAidcFile` / `readAidcFile`
  - [ ] Pass context in-memory from parent to child
  - [ ] Update `compileNode` to receive context as parameter
  - [ ] Update child compilation to use passed context

- [ ] **Update prompts**
  - [ ] Emphasize interface-driven design
  - [ ] Prompt parent to decide per-child context
  - [ ] Prompt for explicit utility forwarding decisions

- [ ] **Update tests**
  - [ ] Remove `.aidc` tests
  - [ ] Add source map tests
  - [ ] Add context passing tests

---

### Phase 8: Build Phase (Code Generation)
- [ ] Execute leaf nodes
- [ ] Generate code to `build/`
- [ ] Parallel leaf execution
- [ ] Add source module comment header to generated files

### Phase 9: TUI (`--browse`)
- [ ] Tree view of `.aid-gen/` structure
- [ ] View node content
- [ ] View/answer `.aidq` questions
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

## Context Model

### Old Model (Wrong)
```
Parent compiles → writes .aidc with ALL ancestor context
Child reads .aidc → sees everything from all ancestors
```

Problems:
- Token budgets explode
- Irrelevant context confuses AI
- Changes leak across branches

### New Model (Correct)
```
Parent compiles:
  - Decides what EACH child needs
  - Passes context IN-MEMORY (not via file)
  - Can instruct child to forward utilities to grandchildren

Child compiles:
  - Receives ONLY what parent passed
  - Has no access to grandparent details (encapsulated)
```

### What Parent Passes to Child

```typescript
interface ChildContext {
  // What this child must implement
  interfaces: Record<string, {
    definition: string;
    source: string;
  }>;
  
  // Rules this child must follow
  constraints: Array<{
    rule: string;
    source: string;
  }>;
  
  // Utilities this child can use
  utilities: Array<{
    name: string;
    signature: string;
    location: string;
  }>;
  
  // Instructions for forwarding to grandchildren
  forwarding?: {
    utilities: string[];  // Names to forward
  };
}
```

### File Structure

| File | Purpose |
|------|---------|
| `.aidg` | Clean, human-readable spec |
| `.aidg.map` | Source map for traceability |
| `.aidq` | Questions for human review |
| `.aids` | Suggestions (future) |
| ~~`.aidc`~~ | **Removed** - context passed in-memory |

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
bun test              # unit + integration (179 tests)
bun test tests/e2e    # real AI calls (manual)
```
