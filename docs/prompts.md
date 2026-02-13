> **OUTDATED**: This document may not reflect current design. Ask the user before assuming anything here is true.

# Parallel Work Prompts

These prompts can be given to separate Claude instances to work on different parts of AIDef in parallel. Each instance should be given the relevant AGENTS.md context and pointed to `src/types/index.ts` for interface definitions.

---

## Prompt 1: Lexer

```
I'm working on AIDef, a tool that compiles .aid files (CSS-like syntax) into code.

Read these files first:
- AGENTS.md (project rules)
- docs/file-formats.md (syntax specification)
- src/types/index.ts (interface definitions)

Your task: Implement the lexer in `src/parser/lexer.ts`

The lexer should:
1. Tokenize .aid files according to the Token/TokenType interfaces
2. Handle: identifiers, braces, selectors (.tag, :pseudo), @imports, !important
3. Preserve /* */ and // comments as tokens (they're stripped later, but we need them for source maps)
4. Handle ``` code blocks and `inline code` as single tokens (no parsing inside)
5. Track line/column for each token
6. Collect errors but continue lexing (error recovery)

Create tests in `tests/unit/lexer.test.ts` covering:
- Basic identifiers and braces: `server { }`
- Tags: `.tag { }`
- Nested blocks
- Imports: `@./file`, `@./file.aid`, `@https://...`
- !important modifier
- Comments (both styles)
- Code blocks (should not parse contents)
- Error cases (unclosed braces, etc.)

Use `bun test` to run tests.
```

---

## Prompt 2: AST Parser

```
I'm working on AIDef, a tool that compiles .aid files (CSS-like syntax) into code.

Read these files first:
- AGENTS.md (project rules)
- docs/file-formats.md (syntax specification)
- src/types/index.ts (interface definitions)
- src/parser/lexer.ts (lexer implementation - you'll use this)

Your task: Implement the AST parser in `src/parser/ast.ts`

The parser should:
1. Take Token[] from lexer, output RootNode (AST)
2. Parse module blocks: `name { }` → ModuleNode
3. Parse tag blocks: `.tag { }` → TagBlockNode
4. Parse combinators: `parent child`, `parent > child`, `a + b`, `a ~ b`
5. Parse pseudo-selectors: `:leaf`, `:has(x)`, `:not(x)`, `:or(a, b)`
6. Handle nesting (unlimited depth)
7. Prose between/outside blocks → ProseNode
8. @imports → ImportNode
9. Error recovery: collect errors, continue parsing

Follow CSS specificity rules for selector precedence.

Create tests in `tests/unit/ast.test.ts` covering:
- Simple module: `server { content }`
- Nested modules: `server { api { } }`
- Tags: `.api { }`
- Combined: `server.api { }`
- Pseudo-selectors: `:leaf { }`, `server:has(db) { }`
- Combinators: `parent > child { }`
- Prose nodes
- Import nodes
- Error recovery

Use `bun test` to run tests.
```

---

## Prompt 3: Import Resolver

```
I'm working on AIDef, a tool that compiles .aid files (CSS-like syntax) into code.

Read these files first:
- AGENTS.md (project rules)
- docs/file-formats.md (syntax specification)
- src/types/index.ts (interface definitions)
- src/parser/lexer.ts (lexer)
- src/parser/ast.ts (AST parser)

Your task: Implement import resolution in `src/parser/resolver.ts`

The resolver should:
1. Take a RootNode AST, resolve all ImportNode entries
2. Support import formats: `@name`, `@./path`, `@./path.aid`, `@https://url`
3. For .aid files: parse recursively, merge AST
4. For non-.aid files (.md, .txt): inline as ProseNode
5. Handle scoped imports: `server { @./db }` → db content becomes children of server
6. Detect and error on circular imports
7. Resolve relative paths from the importing file's directory

Output: ResolvedSpec with fully resolved AST and import map.

Create tests in `tests/unit/resolver.test.ts` covering:
- Simple import: `@./other`
- Import with extension: `@./other.aid`
- Non-.aid import: `@./readme.md` (becomes prose)
- Scoped import: `server { @./server-details }`
- Nested imports (file imports file)
- Circular import detection
- Missing file errors

Use temporary files in /tmp for tests. Use `bun test` to run tests.
```

---

## Prompt 4: Provider Abstraction

```
I'm working on AIDef, a tool that compiles .aid files (CSS-like syntax) into code.

Read these files first:
- AGENTS.md (project rules)
- docs/todos.md (design decisions about providers)
- src/types/index.ts (interface definitions)

Your task: Implement the provider abstraction in `src/providers/`

Create:
1. `src/providers/provider.ts` - Base Provider interface implementation
2. `src/providers/anthropic.ts` - Anthropic (Claude) adapter using @ai-sdk/anthropic
3. `src/providers/openai.ts` - OpenAI adapter using @ai-sdk/openai  
4. `src/providers/index.ts` - Factory to get provider by name

The provider should:
1. Implement the Provider interface from types
2. Use Vercel AI SDK (`ai` package) with @ai-sdk/* providers
3. Handle compile() and generate() requests
4. Return structured CompileResult/GenerateResult
5. testConnection() should make a minimal API call

Also create:
- `src/providers/call-logger.ts` - Logs all calls to .aid-plan/calls.jsonl

Use temperature: 0 for consistency.

Create tests in `tests/unit/provider.test.ts` with MOCKED responses (no real API calls).
Tests should verify request/response transformation, not actual AI output.

Install dependencies: `bun add ai @ai-sdk/anthropic @ai-sdk/openai`
```

---

## Prompt 5: CLI Skeleton

```
I'm working on AIDef, a tool that compiles .aid files (CSS-like syntax) into code.

Read these files first:
- AGENTS.md (project rules)
- docs/flow.md (execution flow)
- src/types/index.ts (interface definitions)

Your task: Implement the CLI in `src/cli/`

Create:
1. `src/cli/index.ts` - Entry point, argument parsing
2. `src/cli/commands/run.ts` - Default compile command
3. `src/cli/commands/browse.ts` - TUI mode (stub for now, just print "TUI not implemented")
4. `src/cli/commands/build.ts` - Build phase (stub)
5. `src/cli/commands/auth.ts` - Provider auth TUI (stub)
6. `src/cli/commands/estimate.ts` - Cost estimation (stub)

The CLI should:
1. Use Bun.argv for argument parsing (no external deps)
2. Find root.aid in current directory (or error)
3. Create .aid-plan/ if it doesn't exist
4. Support flags: --browse, --build, --auth, --estimate, --verbose, --help
5. Print progress to stdout
6. Return appropriate exit codes

Also update package.json:
- Add "bin": { "aid": "./src/cli/index.ts" }
- Add scripts: "aid": "bun src/cli/index.ts"

Create tests in `tests/unit/cli.test.ts` covering argument parsing.
```

---

## Prompt 6: Compiler (Single Node)

```
I'm working on AIDef, a tool that compiles .aid files (CSS-like syntax) into code.

Read these files first:
- AGENTS.md (project rules)
- docs/flow.md (execution flow)
- docs/isolation.md (context passing)
- src/types/index.ts (interface definitions)

Prerequisites (must exist):
- src/parser/* (lexer, ast, resolver)
- src/providers/* (provider abstraction)

Your task: Implement single-node compilation in `src/compiler/`

Create:
1. `src/compiler/compile-node.ts` - Compile a single node
2. `src/compiler/context-builder.ts` - Build context for children (in-memory)
3. `src/compiler/writer.ts` - Write .plan.aid, .plan.aid.questions.json files to .aid-plan/

The compiler should:
1. Take a resolved AST node + parent context
2. Call provider.compile() with the spec
3. Generate child .plan.aid files (CSS-like format, same as input)
4. Pass context in-memory to children during compilation
5. Generate .plan.aid.questions.json file (YAML) if there are questions
6. Log call to calls.jsonl via call-logger

For MVP: Compile root node only, no recursion yet.

Create tests in `tests/integration/compile.test.ts` with MOCKED provider responses.
```

---

## After All Complete: Integration

Once all the above are done, a final integration pass will:
1. Wire everything together in the CLI run command
2. Add recursive compilation
3. Add parallel execution of siblings
4. Add the build phase (code generation)
5. Implement the TUI (--browse)

---

## Important Notes for All Prompts

1. **Read src/types/index.ts first** - All interfaces are defined there
2. **Use Bun** - Not Node.js. `bun test`, `Bun.file()`, etc.
3. **No destructive git** - Never use checkout, stash, revert
4. **TypeScript strict mode** - All code must type-check
5. **Tests are required** - Each module needs tests
6. **Mock AI calls** - No real API calls in tests (costs money)
