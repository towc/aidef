# AIDef File Formats

## Overview

AIDef uses three file types:
- **`.aid`** files: AI Definition files containing specifications (CSS-like natural language)
- **`.aidc`** files: AI Definition Context files (JSON, machine-generated)
- **`.aiq`** files: AI Questions files containing uncertainties (natural language)

No database—files are the source of truth. Each submodule can run independently with its `node.aid` + `node.aidc`.

## The `.aid` File Format

### Core Principle: Any Natural Language is Valid

A `.aid` file is just text. Write what you want, how you want. The AI interprets it.

This is a valid `.aid` file:

```aid
Build me a REST API for managing tasks. Use TypeScript.
Tasks have a title, description, and status (todo/doing/done).
I want CRUD endpoints. Keep it simple.
```

So is this:

```aid
I need an authentication system.

Requirements:
- Users sign up with email/password
- Passwords must be hashed (bcrypt preferred)
- JWT tokens for sessions
- Refresh token rotation would be nice but not critical

The session handling should be its own module because
I might want to swap it out later.
```

Both work. The AI reads your intent and acts on it.

### CSS-Like Syntax (Optional Power Features)

For power users, `.aid` files support a CSS-inspired syntax that provides structure, scoping, and editor support. **This is entirely optional**—plain English always works.

Set `filetype=css` in your editor for syntax highlighting.

#### Module Blocks: `@name { }`

Define submodules with scoped instructions:

```aid
A REST API for task management.

@auth {
  handle login, logout, password reset
  JWT for sessions
}

@tasks {
  CRUD operations
  tasks belong to projects
}

@config {
  load environment variables
}
```

#### Tags: `.tag { }`

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

@users.api.database {
  // this module matches both tags
}
```

#### Universal Selector: `* { }`

Explicit global rules (equivalent to just writing them at the top level):

```aid
* {
  TypeScript with strict mode
}
```

#### Nesting

Unlimited depth, but keep shallow when interfaces are well-defined:

```aid
@server {
  @api {
    @auth {
      // only nest this deep if truly needed
    }
  }
}
```

### Full Selector Reference

| Syntax | Meaning |
|--------|---------|
| `@name { }` | Named module |
| `.tag { }` | Tag (AI-matched to relevant modules) |
| `* { }` | All modules |
| `@a.tag { }` | Module `@a` that also matches `.tag` |
| `.tag1.tag2 { }` | Intersection (must match both tags) |
| `:or(@a, @b) { }` | Union (matches either) |
| `:not(.tag) { }` | Exclusion |
| `@parent @child { }` | Descendant (child anywhere under parent) |
| `@parent > @child { }` | Direct child only |
| `@a + @b { }` | Adjacent sibling |
| `@a ~ @b { }` | General sibling |

### Pseudo-Selectors

| Syntax | Meaning |
|--------|---------|
| `:leaf { }` | Only leaf nodes (no children) |
| `:root { }` | Only the root module |
| `:has(@child) { }` | Parent containing specific child |
| `:first-child { }` | First child of parent |
| `:last-child { }` | Last child of parent |
| `:nth-child(n) { }` | Nth child of parent |

### Specificity

CSS specificity rules apply. More specific selectors override general ones:

```aid
.api {
  return JSON
}

@legacy.api {
  // more specific - could override if needed
  return XML for backwards compatibility
}
```

### `!important` - Strong Emphasis

Attaches to the previous statement. Means "persist this even if child modules receive conflicting instructions":

```aid
@transpiler {
  use AST parser, not regex !important
  
  /*
    This emphasis carries through to children.
    Even if later context suggests "keep it simple, use regex",
    this !important should win.
  */
}
```

Note: `!important` is about emphasis, not specificity. CSS specificity rules handle conflicts between selectors.

### Comments (Human-Only)

Comments are stripped before the AI sees the content. Use them for notes to yourself or future maintainers:

```aid
/* 
  Block comment - C/CSS style
  Can span multiple lines
*/

// Line comment - also supported

@transpiler {
  // We tried regex in v1 - it was a disaster
  // See incident report: docs/postmortem-001.md
  use AST parser, not regex !important
}
```

### Code Blocks (No Parsing)

Markdown fenced code blocks and inline code are treated as literal prose—no parsing inside:

````aid
@transpiler {
  output should look like this:
  
  ```typescript
  const ast = parse(source);
  // This { } won't be parsed as a submodule
  if (ast.valid) {
    emit(ast);
  }
  ```
  
  Use `{}` for empty objects, not `new Object()`.
}
````

### Bare `{ }` = Prose

If `{ }` appears without a selector prefix (`@`, `.`, `:`, `*`), it's treated as prose:

```aid
use objects {} for configuration   // prose, not a block
functions like map() are useful    // prose, parens ok
@api { REST endpoints }            // module block
```

**Linter warning**: The build tool warns on bare `{}` to catch typos:

```
warning: bare {} at line 12 - treating as prose
  hint: did you mean @name {} for a module?
```

### Execution Model

**Everything runs in parallel.** All sibling modules compile and build simultaneously. Dependencies are handled by interface contracts passed from parent to child, not by execution order.

If you think you need sequential execution, you probably need better interface definitions instead.

## The `.aiq` File Format

### Purpose

`.aiq` files capture uncertainties and questions that arise during compilation. The AI doesn't block on these—it makes a best-effort assumption and logs the question for you to review.

### Structure

`.aiq` files are also just text. The AI writes them in a readable format:

```
# Questions for: auth/session

## Session Persistence

The spec doesn't mention whether sessions should survive server restarts.

I'm assuming in-memory sessions (simpler), but if you want persistence,
we'd need Redis or database storage. Let me know.

Current assumption: in-memory
Impact if wrong: would need to refactor session storage

---

## Token Expiration

No expiration time specified for JWT tokens.

Going with 24 hours as a reasonable default. Options:
- 1 hour (more secure, worse UX)
- 24 hours (balanced)
- 7 days (convenient, less secure)
- No expiration (not recommended)

Current assumption: 24 hours

---

## Note: Rate Limiting

The auth module would benefit from rate limiting on login attempts
to prevent brute force attacks. Not implementing it since it wasn't
specified, but flagging for consideration.
```

### Answering Questions

Edit the `.aiq` file directly or use `--browse` mode:

```
## Session Persistence
...

Answer: Use Redis. We'll need persistence for horizontal scaling.
```

On the next run, answered questions inform the AI's decisions.

## The `.aidc` File Format (Context)

### Purpose

`.aidc` files contain **all context that might be relevant** to child modules. They're JSON, machine-generated during compilation.

A separate "context filter" agent reads the `.aidc` and decides what subset to actually feed to the generator. This keeps generation focused while preserving full context for edge cases.

### Structure

```json
{
  "module": "auth",
  "parent": "server",
  "ancestry": ["root", "server", "auth"],
  
  "interfaces": {
    "User": {
      "source": "root",
      "definition": "{ id: string, email: string, createdAt: Date }"
    },
    "AuthService": {
      "source": "server",
      "definition": "{ login(email, password): Promise<Session> }"
    }
  },
  
  "constraints": [
    {
      "rule": "TypeScript strict mode",
      "source": "root",
      "important": true
    },
    {
      "rule": "use bcrypt for password hashing",
      "source": "server.auth",
      "important": true
    }
  ],
  
  "conventions": [
    {
      "rule": "prefer Bun APIs over Node",
      "source": "root",
      "selector": "*"
    }
  ],
  
  "tags": ["api", "database"],
  
  "utilities": [
    {
      "name": "hashPassword",
      "signature": "(plain: string) => Promise<string>",
      "location": "utils/hash.ts",
      "source": "server"
    }
  ]
}
```

### Key Fields

| Field | Purpose |
|-------|---------|
| `ancestry` | Full path from root (for debugging/context) |
| `interfaces` | Type definitions this module should know about |
| `constraints` | Rules that apply, with source and importance |
| `conventions` | Style/pattern guidelines from ancestor selectors |
| `tags` | Tags that apply to this module (for `.tag {}` matching) |
| `utilities` | Shared utilities available (signatures, not implementations) |

### Context Flow

```
root.aid
    │
    ├── [Compilation] outputs: auth/node.aidc
    │   Contains: ALL potentially relevant context
    │
    ▼
auth/node.aid + auth/node.aidc
    │
    ├── [Context Filter Agent]
    │   Decides: What's actually relevant for auth generation?
    │   Future: "Skills" system triggers rules based on keywords
    │
    ├── [Generation Agent]
    │   Receives: node.aid + filtered context
    │   Outputs: code or child specs
    │
    └── [Post-Generation Checks] (TODO)
        Verify: outputs match declared interfaces
```

## File Locations

| Location | Purpose |
|----------|---------|
| `root.aid` | Your source of truth (you edit this) |
| `.aid/<name>/node.aid` | Generated submodule spec |
| `.aid/<name>/node.aidc` | Context from parent (JSON) |
| `.aid/<name>/node.aiq` | Questions/uncertainties |
| `build/` | Generated code |

Each submodule is independently runnable: `node.aid` + `node.aidc` = complete context.

```
.aid/
├── auth/
│   ├── node.aid        # Spec for auth module
│   ├── node.aidc       # Context from parent (JSON)
│   ├── node.aiq        # Questions about auth
│   └── session/
│       ├── node.aid    # Spec for session submodule
│       ├── node.aidc   # Context from auth (JSON)
│       └── node.aiq    # Questions about sessions
└── config/
    ├── node.aid        # Leaf - generates code directly
    └── node.aidc       # Context from root
```

## Examples

### Example 1: Natural Language (No Special Syntax)

```aid
# Task Manager API

A simple REST API for managing tasks and projects.

Use TypeScript with strict mode - this is required.
All endpoints return JSON with consistent error shapes.
Use Zod for validation, SQLite for the database.

Drizzle ORM would be nice but I'm flexible.

The projects module handles CRUD for projects.
Each project has many tasks.

The tasks module handles CRUD for tasks.
Tasks belong to a project (required).
Status can be: pending, in_progress, completed.
Priority can be: low, medium, high.

Config module just loads environment variables.
Health check endpoint returns { status: "ok" }.

Include basic unit tests for all modules.
```

### Example 2: CSS-Like Syntax (Power User)

```aid
/*
  Task Manager API
  Using CSS-like syntax for structure and editor support
*/

A simple REST API for managing tasks and projects.

// Global requirements
TypeScript strict mode !important
All endpoints return JSON with consistent error shapes.
Zod for validation, SQLite for persistence.

.database {
  use Drizzle ORM
  handle connection errors gracefully
}

@projects.database {
  CRUD operations
  has many tasks (one-to-many)
  fields: id, name, description, createdAt, updatedAt
}

@tasks.database {
  CRUD operations  
  belongs to project (required)
  fields: id, title, description, status, priority, projectId, createdAt, updatedAt
  status enum: pending, in_progress, completed
  priority enum: low, medium, high
}

@config {
  load environment variables
  validate required config exists
  export typed config object
}

@health {
  GET /health returns { status: "ok", timestamp }
}

:leaf {
  include basic unit tests
}
```

### Example 3: AIDef's Own `root.aid`

This is what `root.aid` would look like for the AIDef project itself:

```aid
/*
  AIDef - A programming language where AI is the runtime
  
  This file defines AIDef using AIDef syntax.
  Meta, but useful as a reference.
*/

// Project overview
A CLI tool that compiles .aid files into a tree structure,
then builds code from leaf nodes.

TypeScript strict mode !important
Bun runtime, not Node !important

.cli {
  use Bun.argv for argument parsing
  support --browse for TUI mode
  support --build to execute leaf nodes
  support --estimate for cost estimation
}

.parser {
  handle CSS-like syntax: @module, .tag, selectors
  preserve code blocks (```) as literal prose
  strip // and /* */ comments before AI sees content
  warn on bare {} (linter)
}

@compiler {
  // Phase 1: parse root.aid, generate .aid tree
  
  reads root.aid, outputs .aid/ folder structure
  each node outputs interfaces for children
  nodes cannot read siblings or .aid/ folder
  
  @parser.parser {
    parse .aid file syntax
    extract modules, tags, selectors
    handle nesting and specificity
  }
  
  @differ {
    compare new vs existing .aid outputs
    skip subtrees with identical interfaces
  }
  
  @context {
    determine what context to pass to children
    annotate where each directive came from
  }
}

@tree {
  // Manages the recursive node structure
  
  @node {
    represents a single .aid file
    tracks parent, children, status
  }
  
  @scheduler {
    parallel execution of all siblings
    no sequential dependencies (by design)
  }
}

@cli.cli {
  // User-facing CLI interface
  
  @browse {
    TUI for watching compilation progress
    browse .aid tree structure
    view and answer .aiq questions
    abort early if needed
  }
  
  @run {
    standard mode: compile, stream .aiq items
  }
  
  @build {
    execute leaf nodes
    generate code to ./build/
  }
}

@questions {
  // .aiq file handling
  
  generate .aiq files for uncertainties
  parse answered questions
  inject answers into next compilation
}

:leaf {
  include unit tests
  use bun test
}

* {
  prefer Bun APIs over Node equivalents
  Bun.file over fs
  Bun.serve if HTTP needed
  Bun.$ for shell commands
}
```

---

## Summary

| Feature | Syntax | Required? |
|---------|--------|-----------|
| Natural language | Just write | Yes (this is the core) |
| Module blocks | `@name { }` | Optional |
| Tags | `.tag { }` | Optional |
| Pseudo-selectors | `:leaf { }`, `:has()`, etc. | Optional |
| Strong emphasis | `!important` | Optional |
| Comments | `/* */`, `//` | Optional |
| Code blocks | ``` ` ``` ` ``` | Recommended for examples |

Write what you want. The rest is just convenience.
