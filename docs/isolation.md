# Agent Isolation and Context Passing

## The Isolation Principle

AIDef's core architectural principle: **each compilation agent is sandboxed**. This enables:

1. **True parallelization**: No shared mutable state between agents
2. **Reproducibility**: Same inputs always yield same outputs
3. **Modularity enforcement**: Agents can't "cheat" by reading siblings
4. **Independent submodules**: Each folder can run as its own project

## What Each Agent Can Access

### Allowed (Whitelist)

| Resource | Description |
|----------|-------------|
| `node.aid` | The specification being processed |
| `node.aidc` | Context file (JSON) with all potentially relevant info from ancestors |
| Explicitly referenced files | Files referenced in the `.aid` |
| Answered questions | Resolved `.aiq` entries for this node |

### Forbidden (Blacklist)

| Resource | Why |
|----------|-----|
| Other `.aid` files | Would break isolation, enable implicit coupling |
| Sibling `.aidc` files | Siblings are parallel; can't have dependencies |
| `.aid/` folder contents | Build artifacts shouldn't influence builds |
| `build/` folder contents | Generated code shouldn't influence generation |

## The `.aidc` Context File

Each node receives a `node.aidc` file containing **all context that might be relevant**:

```json
{
  "module": "auth",
  "ancestry": ["root", "server", "auth"],
  
  "interfaces": {
    "User": { "source": "root", "definition": "..." },
    "AuthService": { "source": "server", "definition": "..." }
  },
  
  "constraints": [
    { "rule": "TypeScript strict mode", "source": "root", "important": true },
    { "rule": "use bcrypt", "source": "server.auth", "important": true }
  ],
  
  "conventions": [
    { "rule": "prefer Bun APIs", "source": "root", "selector": "*" }
  ],
  
  "utilities": [
    { "name": "hashPassword", "signature": "...", "location": "utils/hash.ts" }
  ],
  
  "tags": ["api", "database"]
}
```

### Context Filter Agent

Before generation, a separate agent reads the `.aidc` and decides **what subset is actually relevant** for this specific generation. This keeps prompts focused while preserving full context.

```
node.aidc (full context)
    │
    ├── [Context Filter Agent]
    │   "This is an auth module. Relevant: User interface, bcrypt constraint."
    │   "Not relevant: database connection details, UI conventions."
    │
    ▼
Filtered context → Generation Agent
```

Future: A "skills" system could trigger specific rules based on keywords detected in the spec.

## Context Flow

### Parent → Child

```
root.aid
    │
    ├── [Compilation Agent]
    │   Reads: root.aid
    │   Outputs: child node.aid + child node.aidc (full context)
    │
    ▼
auth/node.aidc contains:
  - All interfaces from root
  - All constraints (with source annotations)
  - All conventions that might apply
  - Utilities declared at root level

auth/node.aid + auth/node.aidc
    │
    ├── [Context Filter] → [Compilation Agent]
    │
    ▼
auth/session/node.aidc contains:
  - Everything from auth/node.aidc
  - Plus: interfaces declared in auth
  - Plus: constraints from auth
```

### What Gets Passed (in `.aidc`)

1. **Interface definitions**: Types, function signatures (with source)
2. **Constraints**: Rules that apply, marked with `important` flag
3. **Conventions**: Patterns from ancestor selectors (*, .tag, etc.)
4. **Utilities**: Signatures and locations (not implementations)
5. **Tags**: What tags apply to this module
6. **Ancestry**: Full path from root (for debugging)

### What Doesn't Get Passed

1. **Implementation details**: How things work internally
2. **Sibling information**: What parallel nodes are doing
3. **Intermediate reasoning**: Why ancestor decisions were made

## Shared Utilities

### The Challenge

If agents can't read each other's outputs, how do shared utilities work?

### The Solution: Declare in `.aidc`, Generate Once

Parent declares utility in its output context:
```json
{
  "utilities": [{
    "name": "hashPassword",
    "signature": "(plain: string) => Promise<string>",
    "location": "utils/hash.ts",
    "source": "root"
  }]
}
```

Children receive this in their `.aidc` and use the signature:
```typescript
// Child knows the signature from node.aidc
import { hashPassword } from '../utils/hash';

async function createUser(password: string) {
  const hash = await hashPassword(password);
  // ...
}
```

A dedicated leaf node generates the actual utility files.

## Interface Contracts

### Strict vs. Flexible

Constraints in `.aidc` include an `important` flag:

```json
{
  "constraints": [
    { "rule": "AuthService interface must match exactly", "important": true },
    { "rule": "Logger interface can be extended", "important": false }
  ]
}
```

### Post-Generation Checks (TODO)

After generation, verify:
1. Outputs conform to declared interfaces
2. No forbidden file access patterns
3. Utility imports match declared signatures

This is future work—flag deviations for review rather than blocking.

## Example: Multi-Level Context Flow

```
root.aid
├── node.aidc: (none - this is root)
├── Outputs to children:
│   - AppConfig interface
│   - Logger utility @ utils/logger.ts
│
└── server/
    ├── node.aid
    ├── node.aidc: { interfaces: [AppConfig], utilities: [Logger], ... }
    ├── Outputs to children:
    │   - BaseService class
    │   - validateInput utility
    │
    └── auth/
        ├── node.aid
        ├── node.aidc: { interfaces: [AppConfig, BaseService], 
        │                utilities: [Logger, validateInput], ... }
        ├── Outputs to children:
        │   - AuthService interface
        │
        └── session/
            ├── node.aid (leaf)
            ├── node.aidc: { interfaces: [..., AuthService], ... }
            └── Generates: session.ts
```

Each level passes everything that *might* be relevant. The context filter agent at each level decides what actually matters.

## Independent Submodules

Each folder is a complete, runnable unit:
- `node.aid` - The specification
- `node.aidc` - All context from ancestors

You can `cd` into any `.aid/` subfolder and run `aid .` to compile just that subtree. The `.aidc` provides all needed context.

## Anti-Patterns

### Don't: Implicit Dependencies

```aid
# BAD: Assumes sibling exists
@auth { ... }
@users { needs auth to be compiled first }
```

### Do: Explicit Context

```aid
# GOOD: Parent provides what's needed
AuthService interface (defined above) is passed to all children.

@auth { implements AuthService }
@users { consumes AuthService }
```

### Don't: File Path Assumptions

```aid
# BAD: Hardcoded paths
Import from ../../auth/session.ts
```

### Do: Declared Utilities

```aid
# GOOD: Declared in parent, received via .aidc
hashPassword utility @ utils/hash.ts
```

## Debugging Isolation Issues

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Cannot resolve import" | Undeclared utility | Add to parent's declarations |
| "Interface mismatch" | Child diverged from parent | Update constraint or implementation |
| "Missing context" | `.aidc` doesn't include needed info | Parent should include it |

### Verbose Mode

```bash
aid . --verbose
```

Shows context for each node:
```
Compiling auth/session
  node.aidc contains:
    - Interfaces: AuthService, Session, User
    - Utilities: hashPassword, validateEmail
    - Constraints: 5 (2 important)
    - Tags: api, auth
  
  Context filter selected:
    - Interfaces: AuthService, Session
    - Utilities: hashPassword
    - Constraints: 2 important
```
