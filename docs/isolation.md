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
| `node.aidg` | The compiled specification for this node |
| `node.aidc` | Context file (YAML) with info from ancestors |
| Referenced files | Files explicitly referenced in the spec |
| Answered questions | Resolved entries from `node.aidq` |

### Forbidden (Blacklist)

| Resource | Why |
|----------|-----|
| Other `.aid` files | Would break isolation |
| Sibling `.aidc` files | Siblings are parallel |
| `.aid-gen/` folder | Build artifacts shouldn't influence builds |
| `build/` folder | Generated code shouldn't influence generation |

## The `.aidc` Context File

Each node receives a `node.aidc` (YAML) containing **all context that might be relevant**:

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
  User:
    source: root
    definition: |
      interface User {
        id: string;
        email: string;
      }
  ApiResponse:
    source: server
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

### Context Filter Agent

Before generation, a separate agent reads `.aidc` and decides **what's actually relevant**:

```
node.aidc (full context)
    │
    ├── [Context Filter Agent]
    │   "This is an auth module."
    │   "Relevant: User interface, bcrypt constraint"
    │   "Not relevant: database conventions, UI patterns"
    │
    ▼
Filtered context → Generation Agent
```

Future: A "skills" system could trigger specific rules based on keywords.

## Context Flow

### Parent → Child

```
root.aid
    │
    ├── [Compilation Agent]
    │   Outputs: child node.aidg + child node.aidc
    │
    ▼
server/node.aidc contains:
  - All interfaces from root
  - All constraints (with source annotations)
  - All conventions that might apply
  - Utilities declared at root level

server/node.aidg + server/node.aidc
    │
    ├── [Context Filter] → [Compilation Agent]
    │
    ▼
server/api/node.aidc contains:
  - Everything from server/node.aidc
  - Plus: interfaces declared in server
  - Plus: constraints from server
```

### What Gets Passed (in `.aidc`)

1. **Interfaces**: Types, function signatures (with source)
2. **Constraints**: Rules with `important` flag
3. **Conventions**: Patterns from ancestor selectors
4. **Utilities**: Signatures and locations (not implementations)
5. **Tags**: What tags apply to this module
6. **Ancestry**: Full path from root

### What Doesn't Get Passed

1. **Implementation details**: How things work internally
2. **Sibling information**: What parallel nodes are doing
3. **Intermediate reasoning**: Why ancestor decisions were made

## Shared Utilities

### The Challenge

If agents can't read each other's outputs, how do shared utilities work?

### The Solution: Declare in `.aidc`, Generate Once

Parent declares utility in context:

```yaml
utilities:
  - name: hashPassword
    signature: "(plain: string) => Promise<string>"
    location: utils/hash.ts
    source: root
```

Children receive this in their `.aidc` and use the signature:

```typescript
// Child knows signature from node.aidc
import { hashPassword } from '../utils/hash';

async function createUser(password: string) {
  const hash = await hashPassword(password);
}
```

A dedicated leaf node generates the actual utility files.

## Interface Contracts

### Strict vs. Flexible

Constraints in `.aidc` include an `important` flag:

```yaml
constraints:
  - rule: AuthService interface must match exactly
    important: true
  - rule: Logger interface can be extended
    important: false
```

### Post-Generation Checks (TODO)

After generation, verify:
1. Outputs conform to declared interfaces
2. No forbidden file access patterns
3. Utility imports match declared signatures

## Independent Submodules

Each folder in `.aid-gen/` is a complete, runnable unit:
- `node.aidg` - The compiled specification
- `node.aidc` - All context from ancestors

You can `cd` into any `.aid-gen/` subfolder and run `aid .` to compile just that subtree.

## Example: Multi-Level Flow

```
root.aid
├── (no .aidc - this is root)
├── Outputs to children:
│   - AppConfig interface
│   - Logger utility @ utils/logger.ts
│
└── .aid-gen/server/
    ├── node.aidg
    ├── node.aidc: 
    │     interfaces: [AppConfig]
    │     utilities: [Logger]
    ├── Outputs to children:
    │   - BaseService class
    │   - validateInput utility
    │
    └── api/
        ├── node.aidg
        ├── node.aidc:
        │     interfaces: [AppConfig, BaseService]
        │     utilities: [Logger, validateInput]
        │
        └── routes/
            ├── node.aidg (leaf)
            ├── node.aidc: (everything above)
            └── Generates: routes.ts
```

## Anti-Patterns

### Don't: Implicit Dependencies

```aid
// BAD: Assumes sibling exists
auth { ... }
users { needs auth first }
```

### Do: Explicit Context

```aid
// GOOD: Parent provides interface
AuthService interface available to all children.

auth { implements AuthService }
users { consumes AuthService }
```

### Don't: File Path Assumptions

```aid
// BAD
Import from ../../auth/session.ts
```

### Do: Declared Utilities

```aid
// GOOD: Declared in parent, received via .aidc
hashPassword utility @ utils/hash.ts
```

## Debugging

### Verbose Mode

```bash
aid . --verbose
```

Shows context for each node:

```
Compiling server/api
  node.aidc contains:
    - Interfaces: ApiResponse, User (2)
    - Utilities: validateRequest, logger (2)
    - Constraints: 5 (2 important)
    - Tags: api, http
  
  Context filter selected:
    - Interfaces: ApiResponse
    - Utilities: validateRequest
    - Constraints: 2 important
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Cannot resolve import" | Undeclared utility | Add to parent's declarations |
| "Interface mismatch" | Child diverged | Update constraint or implementation |
| "Missing context" | `.aidc` incomplete | Parent should include it |
