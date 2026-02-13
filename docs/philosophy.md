# AIDef Philosophy

<!-- 
  TODO: Consider renaming to "Cascading AI" with .cai extension.
  The CSS parallel is strong: cascading rules, specificity, inheritance.
  Domain aidef.dev is already owned.
-->

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

### Optional CSS-Like Syntax

For power users, we provide a CSS-inspired syntax for structure and scoping. This gives you:

- **Free editor support**: Set `filetype=css` for syntax highlighting
- **Familiar semantics**: Selectors, specificity, nesting
- **Comments that stay human-side**: `/* */` and `//` are stripped before AI sees content

```aid
/*
  We tried regex parsing before - it was a disaster.
  See postmortem-001.md. AST is mandatory now.
*/

A Garmin watchface displaying hourly weather.

// Global constraints
TypeScript for all non-device code.

.mc {
  // Applies wherever MonkeyC code is relevant
  use bit packing, avoid stored structures
}

server {
  api {
    device-specific token auth
    open-meteo for weather data
  }
}

ui {
  transpiler {
    AST parser, not regex !important
  }
}
```

The syntax is entirely optional—plain English always works. See [file-formats.md](file-formats.md) for the full reference.

### Comments Are For Humans

Just like in regular code, comments exist to explain *why* something is there—often to prevent the AI from making a mistake you've seen before:

```aid
/*
  DO NOT simplify the auth flow. We need the extra
  verification step for compliance reasons. The AI
  tried to "streamline" this twice already.
*/

auth {
  two-factor verification is required !important
}
```

The `/* */` and `//` comments are stripped before the AI sees the content. The `!important` emphasis carries through to child modules.

## The AI Modular Enforcement Problem

A persistent issue with AI-generated code: **it tends toward monoliths**. Without explicit boundaries, AI will happily cram everything into one file, reference globals, and create implicit dependencies.

AIDef enforces modularity by architecture:
- Each agent **cannot read** sibling nodes' implementations
- Context is **passed explicitly** from parent to child
- Interfaces must be **declared** before they can be used

If a node doesn't need to know about something, it literally cannot access it. This isn't just good practice—it's physically enforced.

## Parallel by Default

Everything runs in parallel. All sibling modules compile and build simultaneously.

There's no sequential execution syntax because **you shouldn't need it**. If you think you need module A to complete before module B starts, you actually need better interface definitions. Module B should receive A's interface as context from the parent—not wait for A to finish.

This is the whole point of isolation: nodes don't read each other's output, they receive context from above. Execution order becomes irrelevant.

## Non-Blocking Execution

The system never asks blocking questions during execution. Instead:
- Uncertainties are logged to `.aidq` files (YAML)
- The developer can review and answer via `--browse` mode
- Answers are incorporated in subsequent runs

This keeps the pipeline flowing and lets you batch-review decisions.

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
- CSS-like syntax means existing editor support

## The Trade-offs

AIDef is not magic. We explicitly accept:

1. **Learning curve**: Writing good `.aid` files requires understanding the system
2. **Inference costs**: Large trees mean many AI calls (mitigated by caching and diffing—and possibly less total cost over a project's lifetime since there's no re-explaining context)
3. **Structure overhead**: The discipline may feel restrictive (but that's the point)
4. **Propagation concerns**: Small changes might cascade (mitigated by interface-based diffing)

We believe AI is now capable enough for this approach to work. The main remaining challenge is "lazy coding"—AI ignoring or simplifying the original goal. AIDef addresses this through interface enforcement, explicit context boundaries, and `!important` emphasis that persists through child generation.
