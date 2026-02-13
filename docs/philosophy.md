> **OUTDATED**: This document may not reflect current design. Ask the user before assuming anything here is true.

# AIDef Philosophy

## A Programming Language for AI

AIDef is best understood as **a programming language where AI is the runtime**.

Consider what programming languages have always been: tools that make it easy to transfer concepts from a programmer's mind into actionable instructions. The better a language expresses those concepts intuitively for humans while remaining efficient for machines, the more we consider it a "great" language.

Traditionally, those instructions compile to machine code, bytecode, or transpilation targets. The programmer builds on the shoulders of giants—calling functions others have written, using frameworks others have developed. This is by design. Good abstractions let you focus on your problem, not the plumbing.

**AI-assisted development follows the same pattern.** We use natural language to express our thoughts, and the AI builds on the shoulders of giants by using programming languages, frameworks, libraries, and algorithms that someone else wrote.

The disconnect? Right now, developers write code as **persistent instructions** for the computer, but write to AI as **one-time instructions** that modify that code. The AI session is ephemeral; the code it produces is not.

AIDef inverts this: **write persistent instructions for the AI**, and let it generate the ephemeral implementation.

## The Core Insight

Programming has always been about abstraction layers within "code":

```
Machine code → Assembly → Bytecode/Transpilation targets → High-level languages
```

Each step is a more expressive way to write instructions that compile to the layer below. AIDef is simply the next step in this progression:

```
Machine code → Assembly → Bytecode → High-level languages → .aid
```

`.aid` files aren't a layer *above* high-level code—they **are** high-level code. Just as TypeScript compiles to JavaScript, and C compiles to assembly, `.aid` compiles to TypeScript (or whatever language you specify).

The `.aid` file is your source code. The AI is your compiler. The generated code in `build/` is like object files—useful to inspect, but not what you edit.

## The Familiar Structure

This isn't as radical as it sounds. AIDef projects look like normal programming projects:

```
root.aid           → like main.ts or index.js
├── auth/node.aid  → like auth/index.ts
│   ├── session.aid → like auth/session.ts
│   └── password.aid → like auth/password.ts
└── users/node.aid → like users/index.ts
```

Just as packages contain modules, modules contain classes, and classes contain functions, `.aid` files contain sub-`.aid` files. The tree recurses until leaf nodes—simple tasks the AI can execute directly.

The developer sees the spec all at once, taking in the whole system just like they would with code, instead of scrolling through an unfamiliar message thread.

## Why Not Chat?

The ephemeral chat model has problems:

| Chat Thread | AIDef |
|-------------|-------|
| Context is lost between sessions | Context is in files (version-controlled) |
| Prior baggage assumed | Each agent starts fresh (unless explicitly given context) |
| Single long thread | Many short-lived sessions |
| Context window problems | Context scoped to each node |
| Sequential execution | Heavily parallelized |
| "Can you also..." modifications | Edit the spec, re-run |

When you modify `root.aid`, AIDef can check whether any subtask files need to change, cutting propagation to unaffected branches. This is analogous to incremental compilation—only rebuild what changed.

## Just Write What You Want

A `.aid` file is natural language. Any natural language is valid. Write what you want, how you want:

```aid
Build me an auth system.

Use bcrypt for passwords - this is non-negotiable.
JWT for sessions would be nice, but I'm open to alternatives.
```

That's it. The AI reads your intent.

### Nginx-Like Syntax

We use an nginx-inspired syntax for structure:

```aid
/*
  We tried regex parsing before - it was a disaster.
  See postmortem-001.md. AST is mandatory now.
*/

A Garmin watchface displaying hourly weather;

// Global constraints
TypeScript for all non-device code;

server {
  api {
    device-specific token auth;
    open-meteo for weather data;
  }
}

ui {
  transpiler {
    leaf=true;
    AST parser, not regex;
  }
}
```

Only six hardcoded patterns:
- `name { }` — module block
- `"question?" { }` — query filter (LLM-evaluated)
- `include ./path;` — import file
- `/* */` and `//` — comments (stripped before AI sees content)
- `;` — statement terminator

Everything else is prose. See [file-formats.md](file-formats.md) for the full reference.

### Comments Are For Humans

Just like in regular code, comments exist to explain *why* something is there—often to prevent the AI from making a mistake you've seen before:

```aid
/*
  DO NOT simplify the auth flow. We need the extra
  verification step for compliance reasons. The AI
  tried to "streamline" this twice already.
*/

auth {
  two-factor verification is required;
}
```

The `/* */` and `//` comments are stripped before the AI sees the content.

## The AI Modular Enforcement Problem

A persistent issue with AI-generated code: **it tends toward monoliths**. Without explicit boundaries, AI will happily cram everything into one file, reference globals, and create implicit dependencies.

AIDef enforces modularity by architecture:
- Each agent **cannot read** sibling nodes' implementations
- Context is **passed explicitly** from parent to child
- Interfaces must be **declared** before they can be used

If a node doesn't need to know about something, it literally cannot access it. This isn't just good practice—it's physically enforced.

## Context Flow: The Encapsulation Model

This is fundamental to how AIDef works.

### Parent-Child Context Passing

Context flows **strictly from parent to child**. A child only knows what its parent explicitly passes:

```
Parent compiles:
  Input:  parent's spec + context from grandparent
  Output: child specs + per-child context

Child compiles:
  Input:  child spec + context from parent (NOT grandparent)
  Output: grandchild specs + per-grandchild context
```

This is like function parameters—not global variables. The parent acts as a **context gateway**, deciding:
1. What interfaces this child needs to implement
2. What constraints apply to this child
3. What utilities this child can use
4. What should be forwarded to grandchildren

### Interface-Driven Design

Parents define interfaces in prose, typically using code blocks:

```aid
server {
  A REST API server.
  
  Interfaces:
  ```typescript
  interface RequestHandler {
    handle(req: Request): Response;
  }
  ```
  
  The `handlers` submodule implements RequestHandler.
  The `middleware` submodule can use the `logger` utility.
  Forward the `db` utility to all submodules.
}
```

The compiler LLM is prompted to:
1. **Extract interfaces** from the parent's prose
2. **Design child interfaces** before spawning children
3. **Explicitly pass context** to each child (not broadcast everything)

### Why This Matters

**Without encapsulation** (accumulating all ancestor context):
- Children see irrelevant details from grandparents
- Token budgets explode for deep trees
- Changes in one branch leak into unrelated branches
- AI gets confused by too much context

**With encapsulation** (parent passes only what's needed):
- Children see exactly what they need
- Context size stays bounded
- Changes are isolated
- AI has clear, focused instructions

### Utility Forwarding

Parents explicitly control what flows to grandchildren:

```aid
database {
  Implements the db utility with connection pooling.
  
  The `queries` submodule implements specific queries.
  Forward the `logger` utility to `queries`.
  Do NOT forward connection internals - queries uses the db interface only.
}
```

This is just prose—the AI understands and structures the context accordingly.

## Parallel by Default

Everything runs in parallel. All sibling modules compile and build simultaneously.

There's no sequential execution syntax because **you shouldn't need it**. If you think you need module A to complete before module B starts, you actually need better interface definitions. Module B should receive A's interface as context from the parent—not wait for A to finish.

This is the whole point of isolation: nodes don't read each other's output, they receive context from above. Execution order becomes irrelevant.

## Non-Blocking Execution

The system never asks blocking questions during execution. Instead:
- Uncertainties are logged to `.plan.aid.questions.json` files (YAML)
- The developer can review and answer via `--browse` mode
- Answers are incorporated in subsequent runs

This keeps the pipeline flowing and lets you batch-review decisions.

## File Types

| Extension | Purpose |
|-----------|---------|
| `.aid` | User source files (committed to git) |
| `.plan.aid` | Generated specs in `.aid-plan/` (gitignored) |
| `.plan.aid.map` | Source maps for traceability |
| `.plan.aid.questions.json` | Questions for human review |
| `.aids` | Optimization suggestions (future) |

The `.plan.aid` files are clean and human-readable. Source maps (`.plan.aid.map`) track where each line came from without polluting the spec.

## The Payoffs

### For Large Projects
- **Parallelization**: Build a 100-file project faster than sequentially
- **Surgical updates**: Change one thing, only affected branches recompile
- **Predictable refactors**: Interface enforcement prevents "lazy coding"

### For Teams
- **Architectural documentation** that actually generates code
- **Code reviews** can focus on specification changes
- **Onboarding**: Read the `.aid` tree to understand the system

### For Your Engineering Skills
- You're still writing code (just for a different runtime)
- Version control, diffs, branches all work normally
- Familiar patterns: modules, interfaces, dependencies

## Terminology

AIDef follows traditional compiler terminology, adapted for our two-phase architecture:

### Pipeline Overview

```
Source Code → Parser → AST → Compiler/Planner → Execution Plan → Runtime/Executor → Generated Code
    .aid                           .plan.aid tree                                         build/
```

This is analogous to:
- **PostgreSQL**: Query → Planner → Query Plan → Executor → Results
- **TypeScript**: .ts → Parser → AST → Compiler → .js
- **GCC**: .c → Parser → GIMPLE → Optimizer → RTL → Machine Code

### Terms

| Term | Definition | Files |
|------|------------|-------|
| **Source Code** | Human-written `.aid` files. First-class code, version-controlled. | `.aid` |
| **AST** | Abstract Syntax Tree. In-memory parse result. | (memory) |
| **Execution Plan** | The compiled tree of plan nodes. Cached and reusable. | `.plan.aid` + `.plan.aid.map` |
| **Plan Node** | A single node in the execution plan (one `.plan.aid` file). | individual `.plan.aid` |
| **Generator Node** | A leaf plan node that writes files. Part of the plan, but also executes. | leaf `.plan.aid` |
| **Generated Code** | The output project. Final target of compilation. | `build/*` |

### Roles

| Component | Term | What It Does |
|-----------|------|--------------|
| Parser | **Parser** | Converts `.aid` source to AST |
| Plan Creator | **Compiler** or **Planner** | Transforms AST into execution plan |
| Plan Executor | **Runtime** or **Executor** | Executes the plan via AI |
| The AI | **Runtime Engine** | The "CPU" that executes plan nodes |

### Output Contract

Generator nodes (leaf nodes) can only write files in a **1:many** relationship—one generator node produces one or more files. The parent node specifies what files each generator should produce. This is enforced during compilation as a sanity check.

### Analogies

| AIDef | PostgreSQL | GCC | TypeScript |
|-------|------------|-----|------------|
| `.aid` | SQL query | `.c` source | `.ts` source |
| Execution Plan | Query Plan | GIMPLE/RTL | (internal) |
| Plan Node | Seq Scan, Hash Join | IR instruction | (internal) |
| Generator Node | Result node | Code emitter | Emitter |
| Generated Code | Query result | `.o` / binary | `.js` output |
| Compiler | Query Planner | Front+Middle end | tsc |
| Runtime | Executor | (N/A - ahead of time) | (N/A) |

## The Trade-offs

AIDef is not magic. We explicitly accept:

1. **Learning curve**: Writing good `.aid` files requires understanding the system
2. **Inference costs**: Large trees mean many AI calls (mitigated by caching and diffing—and possibly less total cost over a project's lifetime since there's no re-explaining context)
3. **Structure overhead**: The discipline may feel restrictive (but that's the point)
4. **Propagation concerns**: Small changes might cascade (mitigated by interface-based diffing)

We believe AI is now capable enough for this approach to work. The main remaining challenge is "lazy coding"—AI ignoring or simplifying the original goal. AIDef addresses this through interface enforcement, explicit context boundaries, and the encapsulation model that keeps each node focused on its specific task.
