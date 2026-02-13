# AIDef Implementation TODOs

## Current Phase: MVP Foundation

### Phase 1: Parser (Current)
Build the deterministic foundation first.

#### 1.1 Lexer
- [ ] Tokenize: identifiers, braces, selectors (`.tag`), imports (`@path`)
- [ ] Handle comments: `/* */` and `//` (strip from output)
- [ ] Handle code blocks: ``` ` ``` (preserve as literal prose)
- [ ] Handle `!important` modifier
- [ ] Line/column tracking for error messages

#### 1.2 AST
- [ ] Define AST node types
- [ ] Parse module blocks: `name { }`
- [ ] Parse tag blocks: `.tag { }`
- [ ] Parse pseudo-selectors: `:leaf { }`, `:has() { }`
- [ ] Parse combinators: `parent child`, `parent > child`, etc.
- [ ] Handle nesting
- [ ] Prose nodes (content between/outside blocks)

#### 1.3 Import Resolution
- [ ] Resolve `@path` to file content
- [ ] Support: `@name`, `@./path`, `@./path.aid`, `@url`
- [ ] Parse imported `.aid` files with selectors
- [ ] Inline non-`.aid` files as plain prose
- [ ] Cycle detection
- [ ] Error on missing files

#### 1.4 Selector Resolution
- [ ] Apply CSS specificity rules
- [ ] Merge rules for same target
- [ ] Resolve `:or()`, `:not()`, `:has()`
- [ ] Track rule sources (for `.aidc` annotations)

### Phase 2: CLI Skeleton
- [ ] `aid .` - entry point, find root.aid
- [ ] `aid . --help` - usage info
- [ ] `aid . --auth` - LLM provider configuration TUI
- [ ] `aid . --browse` - stub (prints "not implemented")
- [ ] `aid . --build` - stub
- [ ] `aid . --estimate` - stub
- [ ] `aid . --verbose` - debug output

### Phase 3: Provider Abstraction
- [ ] Provider interface definition
- [ ] Anthropic adapter (first provider)
- [ ] Config loading: `.aidrc`, env vars, `~/.config/aid/`
- [ ] Connection testing in `--auth`
- [ ] Request/response normalization
- [ ] Error handling, retries

### Phase 4: Single-Node Compilation
- [ ] Compile one node (no recursion)
- [ ] Generate `.aidg` output
- [ ] Generate `.aidc` output (YAML)
- [ ] Generate `.aidq` output (YAML) for uncertainties
- [ ] Write to `.aid-gen/`

### Phase 5: Recursive Compilation
- [ ] Walk tree, compile each node
- [ ] Pass context from parent to child
- [ ] Parallel execution of siblings
- [ ] Progress reporting

### Phase 6: Context Filtering
- [ ] Layer 1: Deterministic rules
  - Include `important: true` constraints
  - Include direct parent interfaces
  - Include referenced utilities
  - Trim deep ancestry
- [ ] Layer 2: Relevance scoring
  - Keyword matching
  - Tag intersection
  - Recency weighting
- [ ] Token budget enforcement

### Phase 7: Diffing & Incremental Builds
- [ ] Hash interfaces for comparison
- [ ] Compare new vs existing `.aidg`
- [ ] Skip unchanged subtrees
- [ ] Report what changed

### Phase 8: Build Phase (Code Generation)
- [ ] Execute leaf nodes
- [ ] Generate code to `build/`
- [ ] Parallel leaf execution

### Phase 9: TUI (`--browse`)
- [ ] Tree view of `.aid-gen/` structure
- [ ] View node content
- [ ] View/answer `.aidq` questions
- [ ] Trigger build
- [ ] Abort compilation

### Phase 10: Polish
- [ ] `--estimate` implementation
- [ ] Better error messages
- [ ] Documentation site
- [ ] npm/bun package publishing

---

## Design Decisions

### LLM Provider
Starting with **Anthropic (Claude)** because:
- Good at following structured instructions
- Handles code generation well
- Familiar to the team

Provider abstraction allows easy switching later.

### Determinism
True determinism is impossible with LLMs, but we maximize consistency:
- `temperature: 0`
- Structured prompts with clear output format
- Interface enforcement catches drift
- Diffing skips unchanged subtrees

### Testing Strategy
- **Unit tests**: Parser, deterministic components (mock AI)
- **Structure tests**: Validate output shape, not exact content
- **Snapshot tests**: Catch unintended changes, manual review
- **Property tests**: Output is valid syntax, references are valid
- **Eval suite**: Periodic, curated test cases with human review

### Context Filtering
Hybrid approach:
1. Deterministic rules (always include important constraints, etc.)
2. Heuristic scoring (keyword match, tag intersection)
3. LLM filtering (optional, for edge cases)

Start with layers 1+2 only.

---

## Interfaces to Define First

Before implementation, define these interfaces so work can parallelize:

### `Token` (Lexer output)
```typescript
type TokenType = 
  | 'identifier' | 'brace_open' | 'brace_close'
  | 'dot' | 'colon' | 'star' | 'import'
  | 'important' | 'comment' | 'code_block'
  | 'prose' | 'newline' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}
```

### `ASTNode` (Parser output)
```typescript
type ASTNode =
  | ModuleNode
  | TagNode
  | SelectorNode
  | ProseNode
  | ImportNode;

interface ModuleNode {
  type: 'module';
  name: string;
  children: ASTNode[];
  source: SourceLocation;
}
// ... etc
```

### `ResolvedSpec` (After import resolution)
```typescript
interface ResolvedSpec {
  ast: ASTNode;
  imports: Map<string, ResolvedSpec>;
  sources: SourceMap; // for error reporting
}
```

### `CompiledNode` (Compilation output)
```typescript
interface CompiledNode {
  name: string;
  ancestry: string[];
  prose: string;
  children: string[]; // names only
  interfaces: InterfaceDeclaration[];
  constraints: Constraint[];
  utilities: UtilityDeclaration[];
  tags: string[];
}
```

### `Provider` (LLM abstraction)
```typescript
interface Provider {
  name: string;
  compile(spec: string, context: FilteredContext): Promise<CompilationResult>;
  generate(spec: string, context: FilteredContext): Promise<GenerationResult>;
  testConnection(): Promise<boolean>;
}
```

---

## Questions to Resolve

1. **Selector syntax edge cases**: What happens with `name.tag.tag2:has(child) { }`? 
   - **Decision**: Follow CSS precedence. Parse left-to-right, pseudo-selectors bind to preceding selector.
   - `name.tag.tag2:has(child)` = module `name` with tags `tag`, `tag2`, containing `child`

2. **Import scoping**: When `@file` is inside a block, does it inherit the block's selector context?
   - **Decision**: Yes. `server { @./db }` means db.aid content is scoped under `server`.
   - The imported content becomes children of the containing block.

3. **Error recovery**: Should parser continue after errors? Collect multiple errors?
   - **Decision**: Yes, collect multiple errors. Better DX to see all issues at once.
   - Use "panic mode" recovery: skip to next `}` or block boundary.

4. **Streaming**: Should compilation stream progress, or wait for complete output?
   - **Decision**: Stream. Show progress as nodes complete.
   - Important for `--browse` TUI and cost control (abort early).
