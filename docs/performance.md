# AIDef Performance Considerations

## The Cost Problem

AI inference is expensive. A naive implementation of AIDef could:
- Re-compile entire trees on minor changes
- Serialize work that could be parallel
- Pass excessive context to each node

This document outlines strategies to minimize inference costs while maintaining correctness.

## Parallelization Strategy

### Tree-Level Parallelism

The `.aid` tree structure enables natural parallelization:

```
root.aid
├── auth/node.aid ──────┬── session.aid (leaf)
│                       └── password.aid (leaf)
├── api/node.aid ───────┬── routes.aid (leaf)
│                       └── middleware.aid (leaf)
└── config.aid (leaf)
```

**Parallel execution opportunities:**
1. `auth/node.aid` and `api/node.aid` and `config.aid` can compile simultaneously
2. Once `auth/node.aid` completes, `session.aid` and `password.aid` run in parallel
3. Build phase: All leaves execute simultaneously

### Pipeline Parallelism

Within a single node, some operations can overlap:
- Start parsing next sibling while current node generates output
- Begin child node compilation as soon as parent outputs interface

### Constraint: Sequential Dependencies

Some work must be sequential:
- `@before` directives create explicit ordering
- Child nodes depend on parent's interface output
- Build phase depends on full compilation

## Caching and Incremental Compilation

### Interface-Based Cache Keys

Each `.aid` file's output is cached with a key derived from:
1. The `.aid` file content hash
2. The input context hash (from parent)
3. Any referenced external files' hashes

### Cache Invalidation Rules

**Full recompilation triggers:**
- `root.aid` structural changes
- New `@strict` requirements
- Interface changes (detected by diff agent)

**Partial recompilation triggers:**
- Subtree-only changes
- `@suggest` modifications (may not propagate)

**No recompilation:**
- Whitespace/comment changes (usually)
- Identical interface outputs

### The Diff Agent

A specialized agent compares:
```
Old .aid output (cached) vs New .aid output (proposed)
```

Decision matrix:
| Interface Changed | Implementation Hints Changed | Action |
|------------------|------------------------------|--------|
| No | No | Skip subtree |
| No | Yes | Skip subtree (hints don't affect interface) |
| Yes | * | Recompile subtree |

## Token Optimization

### Context Minimization

Each node receives only:
- Its own `.aid` file content
- Parent's interface output (signatures, types)
- Explicitly referenced config files

**NOT included:**
- Sibling node details
- Grandparent context (unless explicitly passed)
- Implementation code from other branches

### Output Compression

Node outputs should be:
- Interface-focused (types, signatures)
- Concise (no explanatory prose)
- Structured (easy to parse programmatically)

Example good output:
```
interface AuthService {
  login(email: string, password: string): Promise<Session>;
  logout(sessionId: string): Promise<void>;
}

utils:
  - hashPassword: (plain: string) => Promise<string> @ auth/utils/hash.ts
  - verifyPassword: (plain: string, hash: string) => Promise<boolean> @ auth/utils/hash.ts
```

Example bad output:
```
The authentication service will handle user login and logout.
We'll use bcrypt for password hashing because it's secure.
The login function takes an email and password and returns a session...
```

### Prompt Engineering

The AIDef compiler uses carefully crafted prompts that:
- Request structured output
- Discourage verbose explanations
- Focus on interfaces over implementation details

## Cost Monitoring

### Metrics to Track

- Tokens per node (input + output)
- Cache hit rate
- Parallel execution efficiency
- Total compilation time
- Total build time

### Cost Estimation

Before compilation:
```
$ aid . --estimate
Estimated compilation:
  Nodes to compile: 12 (8 cached, 4 new)
  Estimated tokens: ~15,000 input, ~3,000 output
  Estimated cost: $0.02 (GPT-4 pricing)
  Estimated time: 8 seconds (parallel)
```

### Abort Threshold

Users can set cost limits:
```
$ aid . --max-cost 0.10
```

Compilation aborts if estimated cost exceeds threshold.

## Large-Scale Refactoring

### The Scaling Challenge

A project with 100 leaf nodes could mean 100+ AI calls. Strategies:

1. **Aggressive caching**: Most refactors touch few branches
2. **Batching**: Group small related changes
3. **Depth limiting**: Compile to depth N, review, then continue
4. **Dry-run mode**: Show what would change without executing

### Progressive Disclosure

```
$ aid . --depth 2
```

Compiles only to depth 2, showing proposed children without generating them:
```
root.aid
├── auth/node.aid [COMPILED]
│   ├── session.aid [PROPOSED - not yet compiled]
│   └── password.aid [PROPOSED - not yet compiled]
└── api/node.aid [COMPILED]
    └── routes.aid [PROPOSED - not yet compiled]

Continue to depth 3? [y/N]
```

## Future Optimizations

### Speculative Execution

For well-defined patterns, pre-compile common subtrees:
- Standard CRUD modules
- Authentication flows
- Configuration loaders

### Local Model Fallback

For simple decisions (caching, diffing), use smaller/local models:
- Interface comparison: Could use embedding similarity
- Cache key computation: Deterministic, no AI needed
- Simple leaf nodes: Smaller model may suffice

### Distributed Compilation

For very large projects:
- Distribute node compilation across workers
- Aggregate results centrally
- Could integrate with CI/CD
