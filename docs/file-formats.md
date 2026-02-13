> **OUTDATED**: This document may not reflect current design. Ask the user before assuming anything here is true.

# AIDef File Formats

## Overview

AIDef uses three file types plus a call log:

| Extension | Format | Purpose | Who creates |
|-----------|--------|---------|-------------|
| `.aid` | nginx-like | User source files | User |
| `.plan.aid` | nginx-like | Generated/compiled nodes | Compiler |
| `.plan.aid.questions.json` | JSON | Questions/uncertainties | Compiler |
| `calls.jsonl` | JSONL | AI call log for debugging/benchmarking | Compiler |

**Note:** Context (constraints, suggestions, interfaces, utilities) is passed in-memory from parent to child during compilation. There are no separate context files.

User `.aid` files are committed to version control. Generated files in `.aid-plan/` are gitignored.

## The `.aid` File Format

### Core Principle: Any Natural Language is Valid

A `.aid` file is just text. Write what you want, how you want. The AI interprets it.

```aid
Build me a REST API for managing tasks. Use TypeScript.
Tasks have a title, description, and status (todo/doing/done).
I want CRUD endpoints. Keep it simple.
```

### Syntax Overview (nginx-inspired)

For structure, `.aid` files use an nginx-inspired block syntax. The syntax is minimal:
- **Everything is prose by default**
- **Only `{` triggers structure detection**
- **Module names have no spaces**
- **Semicolons terminate statements** (optional for flowing prose)

Set `filetype=nginx` in your editor for syntax highlighting.

## Hardcoded Syntax

These are the **only** patterns with special meaning:

| Pattern | Meaning |
|---------|---------|
| `<name> { }` | Module block |
| `"<question>" { }` | Query filter block (LLM-evaluated) |
| `include <path>;` | Import file content |
| `/* */` | Block comment (stripped before AI) |
| `//` | Line comment (stripped before AI) |
| `;` | Statement terminator |

**That's it. 6 patterns.**

Everything else is prose, passed to the AI for interpretation.

## Module Blocks

A module is defined by an identifier followed by braces:

```aid
server {
  The main application entry point;
  Bun.serve() setup;
  
  api {
    REST endpoints for the application;
    
    projects {
      CRUD for projects;
    }
    
    tasks {
      CRUD for tasks;
    }
  }
  
  db {
    SQLite connection and schema;
  }
}
```

**Module names cannot contain spaces.** This simplifies parsing for both humans and the compiler.

### Parsing Rule

When the parser encounters `{`:
1. Backtrack over whitespace
2. Collect contiguous non-whitespace as the module name
3. If empty or invalid → treat as prose, not a block

## Parameters

Any `<name>="<value>";` or `<name>=<number>;` inside a block is a parameter. These provide metadata to the compiler.

**Currently recognized parameters:**

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `leaf="<reason>";` | Don't subdivide this module | `leaf="single responsibility";` |
| `never="<reason>";` | Forbid this submodule | `never="out of scope for MVP";` |
| `optional="<reason>";` | May be skipped by AI | `optional="performance optimization";` |
| `priority=<n>;` | Compilation order (lower first) | `priority=1;` |
| `path="<path>";` | Output path override | `path="./src/api";` |
| `model="<model>";` | LLM model override | `model="opus";` |

**All parameters require a reason string** (except `priority`). This documents intent for future readers and the AI.

**Unrecognized parameters** trigger a warning but are passed to the AI anyway. This supports plugins and future extensions:

```aid
server {
  someplugin="custom-value";  // Warning: unrecognized parameter 'someplugin'
  ...
}
```

### Examples

```aid
server {
  path="./src";
  The main application entry point;
  
  api {
    REST endpoints;
    
    tasks {
      leaf="simple CRUD, no further breakdown needed";
      CRUD for tasks;
    }
  }
  
  db {
    leaf="single database module";
    path="./src/database";
    SQLite connection and schema;
  }
  
  graphql {
    never="out of scope for MVP";
  }
  
  cache {
    optional="nice-to-have performance layer";
    Redis caching for hot paths;
  }
}
```

## Query Filter Blocks

Apply rules conditionally based on an LLM-evaluated question:

```aid
"does this module interact with external services?" {
  Add retry logic with exponential backoff;
  Handle timeouts gracefully;
  Log all external calls;
}

"is this a database module?" {
  Use transactions for multi-step operations;
  Handle connection errors gracefully;
}
```

The AI evaluates the question for each module and applies the block content where appropriate.

**Note:** This is not a cheap operation. The question is sent to the LLM for each module. Use sparingly.

## Imports

The `include` statement imports content from another file:

```aid
include ./auth;           // imports ./auth.aid
include ./auth.aid;       // explicit extension
include ./readme.md;      // non-.aid files imported as prose
```

Import rules:
- `.aid` files are parsed and their structure merged
- Non-`.aid` files (`.md`, `.txt`, etc.) are inlined as prose
- Paths are relative to the importing file
- No glob patterns (keep imports explicit, like ES6)

### Scoped Imports

Imports inside a block become children of that block:

```aid
server {
  include ./server-conventions;
  
  api {
    include ./api-patterns;
    REST endpoints;
  }
}
```

## Comments

Comments are stripped before the AI sees the content:

```aid
/* 
  Block comment
  Can span multiple lines
*/

// Line comment

server {
  // Implementation note: we tried X, didn't work
  Use approach Y instead;
}
```

## Code Blocks

Markdown fenced code blocks and inline code are treated as literal prose (not parsed):

````aid
server {
  Output should look like this:
  
  ```typescript
  const app = Bun.serve({
    port: 3000,
    fetch(req) {
      return new Response("Hello");
    }
  });
  ```
}
````

## Statements and Semicolons

Semicolons terminate statements. They are **optional for flowing prose** but help with:
- Fine-grained debugging/analysis
- Clear statement boundaries
- Parameter syntax

```aid
// These are equivalent for prose:
This is a multi-line
prose statement that flows
naturally.

This is a multi-line prose statement that flows naturally;

// Semicolons create separate statements:
First requirement;
Second requirement;
Third requirement;
```

## Execution Model

**Everything runs in parallel.** All sibling modules compile and build simultaneously. There is no sequential execution syntax.

---

## The `.plan.aid` File Format (Generated)

Generated nodes use the same syntax as `.aid` files:
- Users can inspect generated specs and understand them
- Snippets can be copied back to user `.aid` files
- Same mental model throughout

The difference: `.plan.aid` files have all imports resolved.

Example `.plan.aid`:

```aid
/*
  Generated from: root.aid > server > api
  Ancestry: root, server, api
*/

REST endpoints for the task manager;
All responses are JSON;

routes {
  CRUD endpoints for tasks and projects;
}

middleware {
  Authentication, logging, error handling;
}
```

---

## The `.plan.aid.questions.json` File Format (Questions)

Questions are JSON. They capture uncertainties for human review.

```json
{
  "module": "auth.session",
  "questions": [
    {
      "id": "session-persistence",
      "question": "Should sessions persist across server restarts?",
      "context": "The spec doesn't mention persistence requirements.",
      "options": [
        { "label": "In-memory only", "description": "Simpler, sessions lost on restart" },
        { "label": "Redis/database", "description": "Sessions survive restarts" }
      ],
      "assumption": "In-memory only",
      "impact": "Would need to refactor session storage if wrong"
    },
    {
      "id": "token-expiration",
      "question": "What should the JWT token expiration be?",
      "context": "No expiration time specified.",
      "options": [
        { "label": "1 hour" },
        { "label": "24 hours" },
        { "label": "7 days" }
      ],
      "assumption": "24 hours",
      "impact": "Security and UX implications"
    }
  ],
  "considerations": [
    {
      "id": "rate-limiting",
      "note": "Auth module would benefit from rate limiting on login attempts",
      "blocking": false
    }
  ]
}
```

### Answering Questions

Edit the `.plan.aid.questions.json` file directly or use `--browse` mode:

```json
{
  "questions": [
    {
      "id": "session-persistence",
      "answer": "Redis/database",
      "answered_by": "developer",
      "answered_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## File Locations

```
project/
├── root.aid                    # User's source (committed)
├── server.aid                  # User's module (committed)  
├── auth.aid                    # User's module (committed)
├── src/                        # Organize .aid files like code
│   ├── api.aid
│   └── models.aid
├── .aid-plan/                   # Generated output (gitignored)
│   ├── root.plan.aid                        # Compiled root
│   ├── server/
│   │   ├── node.plan.aid                    # Compiled node
│   │   └── node.plan.aid.questions.json     # Questions (if any)
│   └── auth/
│       └── node.plan.aid
└── build/                      # Generated code (gitignored)
```

**Note:** Context is passed in-memory during compilation, not stored in files. This enables true parallelization and keeps the output directory clean.

---

## Complete Example

```aid
/*
  Task Manager API
  A demo showing AIDef's nginx-like syntax.
*/

// Global requirements
A simple REST API for managing tasks and projects;

TypeScript strict mode;
All endpoints return JSON with consistent error shapes;
Zod for validation;
SQLite for persistence;

// Query filters (LLM-evaluated)
"is this a database module?" {
  Use transactions for multi-step operations;
  Handle connection errors gracefully;
}

"does this handle user input?" {
  Validate all inputs;
  Sanitize before storage;
}

// Module structure
server {
  path="./src";
  The main application entry point;
  Bun.serve() setup and middleware;
  
  api {
    path="./src/api";
    REST endpoints;
    
    projects {
      CRUD for projects;
      A project has: id, name, description, timestamps;
    }
    
    tasks {
      leaf="simple CRUD operations";
      CRUD for tasks;
      Belongs to a project;
      Status: pending, in_progress, completed;
    }
  }
  
  db {
    leaf="single database concern";
    path="./src/db";
    SQLite via Drizzle;
    Schema definitions;
  }
  
  graphql {
    never="out of scope for MVP";
  }
}

config {
  leaf="simple configuration loading";
  path="./src/config";
  Load environment variables;
  Export typed config object;
}

health {
  leaf="trivial endpoint";
  GET /health returns { status: "ok", timestamp };
}
```

---

## Summary

| Feature | Syntax |
|---------|--------|
| Natural language | Just write prose |
| Module blocks | `name { }` |
| Query filters | `"question?" { }` |
| Imports | `include ./path;` |
| Parameters | `param="value";` inside block |
| Comments | `/* */`, `//` |
| Code blocks | `` ``` `` |
| Statement end | `;` (optional for prose) |

**Design philosophy:** Minimal syntax, maximum prose. The AI interprets your intent.
