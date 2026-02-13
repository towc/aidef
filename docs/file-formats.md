# AIDef File Formats

## Overview

AIDef uses four file types:

| Extension | Format | Purpose | Who creates |
|-----------|--------|---------|-------------|
| `.aid` | CSS-like | User source files | User |
| `.aidg` | CSS-like | Generated/compiled nodes | Compiler |
| `.aidc` | YAML | Context for nodes | Compiler |
| `.aidq` | YAML | Questions/uncertainties | Compiler |

User `.aid` files are committed to version control. Generated files in `.aid-gen/` are gitignored.

## The `.aid` File Format

### Core Principle: Any Natural Language is Valid

A `.aid` file is just text. Write what you want, how you want. The AI interprets it.

```aid
Build me a REST API for managing tasks. Use TypeScript.
Tasks have a title, description, and status (todo/doing/done).
I want CRUD endpoints. Keep it simple.
```

### CSS-Like Syntax (Optional Power Features)

For power users, `.aid` files support a CSS-inspired syntax. Set `filetype=css` in your editor for syntax highlighting.

#### Module Blocks

```aid
A REST API for task management.

server {
  api {
    REST endpoints
  }
  
  db {
    PostgreSQL connection
  }
}

auth {
  JWT-based sessions
}
```

#### Tags

Apply rules to all modules where the AI detects the tag is relevant:

```aid
.database {
  use transactions for multi-step operations
  always handle connection errors
}

.api {
  validate all inputs
  return consistent error shapes
}
```

#### Imports

Pull in content from other files:

```aid
@server                     // imports ./server.aid
@./server                   // same
@./server.aid               // same
@https://example.com/x.aid  // URL import

@./design-philosophy.md     // non-.aid files imported as plain text

server {
  @./server-details         // scoped import
  must be TypeScript
}
```

Import rules:
- `@path` imports and inlines the file content
- `.aid` files are parsed with selector rules
- Other files (`.md`, `.txt`, etc.) are inlined as plain prose
- Imports work in any user `.aid` file

### Full Selector Reference

| Syntax | Meaning |
|--------|---------|
| `name { }` | Named module |
| `.tag { }` | Tag (AI-matched to relevant modules) |
| `* { }` | All modules |
| `name.tag { }` | Module that also matches tag |
| `.tag1.tag2 { }` | Intersection (must match both tags) |
| `:or(a, b) { }` | Union (matches either) |
| `:not(.tag) { }` | Exclusion |
| `parent child { }` | Descendant (child anywhere under parent) |
| `parent > child { }` | Direct child only |
| `a + b { }` | Adjacent sibling |
| `a ~ b { }` | General sibling |

### Pseudo-Selectors

| Syntax | Meaning |
|--------|---------|
| `:leaf { }` | Only leaf nodes (no children) |
| `:root { }` | Only the root module |
| `:has(child) { }` | Parent containing specific child |
| `:first-child { }` | First child of parent |
| `:last-child { }` | Last child of parent |
| `:nth-child(n) { }` | Nth child of parent |

### Specificity

CSS specificity rules apply. More specific selectors override general ones:

```aid
.api {
  return JSON
}

legacy.api {
  // more specific - could override if needed
  return XML for backwards compatibility
}
```

### `!important` - Strong Emphasis

Attaches to the previous statement. Means "persist this even if child modules receive conflicting instructions":

```aid
transpiler {
  use AST parser, not regex !important
}
```

### Comments (Human-Only)

Comments are stripped before the AI sees the content:

```aid
/* 
  Block comment - C/CSS style
  Can span multiple lines
*/

// Line comment

transpiler {
  // We tried regex in v1 - disaster
  use AST parser, not regex !important
}
```

### Code Blocks (No Parsing)

Markdown fenced code blocks and inline code are treated as literal prose:

````aid
transpiler {
  output should look like this:
  
  ```typescript
  const ast = parse(source);
  if (ast.valid) {
    emit(ast);
  }
  ```
}
````

### Execution Model

**Everything runs in parallel.** All sibling modules compile and build simultaneously.

## The `.aidg` File Format (Generated)

Generated nodes use the same CSS-like syntax as `.aid` files. This means:
- Users can inspect generated specs and understand them
- Snippets can be copied back to user `.aid` files if desired
- Same mental model throughout

The difference: `.aidg` files have all imports resolved and selectors applied.

Example `.aidg`:

```aid
/*
  Generated from: root.aid > server > api
  Ancestry: root, server, api
  Tags: api, http
*/

REST endpoints for the task manager.
All responses are JSON.

TypeScript strict mode !important
validate all inputs with Zod !important

use Hono for routing

routes {
  CRUD endpoints for tasks and projects
}

middleware {
  auth, logging, error handling
}
```

## The `.aidc` File Format (Context)

Context files are YAML. They contain all information that *might* be relevant to child nodes.

```yaml
module: server.api
ancestry:
  - root
  - server
  - api
tags:
  - api
  - http

interfaces:
  ApiResponse:
    source: root
    definition: |
      interface ApiResponse<T> {
        data: T;
        error?: string;
      }

constraints:
  - rule: TypeScript strict mode
    source: root
    important: true
  - rule: validate all inputs with Zod
    source: server
    important: true

suggestions:
  - rule: use Hono for routing
    source: server.api

utilities:
  - name: validateRequest
    signature: "(schema: ZodSchema, req: Request) => Promise<T>"
    location: utils/validate.ts
    source: server

conventions:
  - rule: prefer Bun APIs over Node
    source: root
    selector: "*"
```

A **context filter agent** reads this and decides what subset is actually relevant before feeding to the generator.

## The `.aidq` File Format (Questions)

Questions are YAML. They capture uncertainties for human review.

```yaml
module: auth.session

questions:
  - id: session-persistence
    question: Should sessions persist across server restarts?
    context: The spec doesn't mention persistence requirements.
    options:
      - label: In-memory only
        description: Simpler, sessions lost on restart
      - label: Redis/database
        description: Sessions survive restarts
    assumption: In-memory only
    impact: Would need to refactor session storage if wrong

  - id: token-expiration
    question: What should the JWT token expiration be?
    context: No expiration time specified.
    options:
      - label: 1 hour
      - label: 24 hours
      - label: 7 days
    assumption: 24 hours
    impact: Security and UX implications

considerations:
  - id: rate-limiting
    note: Auth module would benefit from rate limiting on login attempts
    blocking: false
```

### Answering Questions

Edit the `.aidq` file or use `--browse` mode:

```yaml
questions:
  - id: session-persistence
    # ... original fields ...
    answer: Redis/database
    answered_by: developer
    answered_at: 2024-01-15T10:30:00Z
```

## File Locations

```
project/
├── root.aid                    # User's source (committed)
├── server.aid                  # User's module (committed)  
├── auth.aid                    # User's module (committed)
├── src/                        # Organize .aid like code
│   ├── api.aid
│   └── models.aid
├── .aid-gen/                   # Generated output (gitignored)
│   ├── root.aidg               # Compiled root
│   ├── server/
│   │   ├── node.aidg           # Compiled node (CSS-like)
│   │   ├── node.aidc           # Context (YAML)
│   │   └── node.aidq           # Questions (YAML)
│   └── auth/
│       ├── node.aidg
│       ├── node.aidc
│       └── api/
│           ├── node.aidg
│           └── node.aidc
└── build/                      # Generated code (gitignored)
```

## Examples

### Example 1: Natural Language

```aid
A REST API for managing tasks and projects.

Use TypeScript with strict mode - required.
All endpoints return JSON with consistent error shapes.
Zod for validation, SQLite for the database.

The projects module handles CRUD for projects.
The tasks module handles CRUD for tasks.
Config module loads environment variables.
```

### Example 2: CSS-Like Syntax

```aid
/*
  Task Manager API
*/

A REST API for managing tasks and projects.

TypeScript strict mode !important
JSON responses !important
Zod for validation !important
SQLite for persistence

.database {
  use Drizzle ORM
  handle connection errors gracefully
}

projects.database {
  CRUD operations
  has many tasks
}

tasks.database {
  CRUD operations
  belongs to project
}

config {
  load environment variables
  export typed config object
}

:leaf {
  include basic unit tests
}
```

### Example 3: With Imports

```aid
// root.aid
@./core-requirements
@./shared-conventions

server {
  @./server-config
  
  api {
    @./api-patterns
    REST endpoints
  }
}

auth {
  @./auth-requirements
}
```

---

## Summary

| Feature | Syntax |
|---------|--------|
| Natural language | Just write |
| Module blocks | `name { }` |
| Tags | `.tag { }` |
| Imports | `@path` |
| Pseudo-selectors | `:leaf { }`, `:has()`, etc. |
| Strong emphasis | `!important` |
| Comments | `/* */`, `//` |
| Code blocks | ``` ` ``` |

Write what you want. The rest is just convenience.
