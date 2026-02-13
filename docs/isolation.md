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
| Context from parent | Interfaces, constraints, utilities passed in-memory |
| Referenced files | Files explicitly referenced in the spec |
| Answered questions | Resolved entries from `node.aidq` |

### Forbidden (Blacklist)

| Resource | Why |
|----------|-----|
| Other `.aid` files | Would break isolation |
| Sibling context | Siblings are parallel, no cross-talk |
| Grandparent details | Parent encapsulates what child needs |
| `.aid-gen/` folder | Build artifacts shouldn't influence builds |
| `build/` folder | Generated code shouldn't influence generation |

## The Encapsulation Model

Context flows **strictly from parent to child**. Unlike a global accumulation model, each parent acts as a **context gateway**:

```
Parent compiles:
  Input:  parent's spec + context received from grandparent
  Output: 
    - Per-child specs (what each child should implement)
    - Per-child context (what each child needs to know)

Child compiles:
  Input:  spec + context from parent (NOT from file, NOT from grandparent)
  Output: per-grandchild specs + per-grandchild context
```

### What Gets Passed (Parent → Child)

The parent explicitly decides what each child receives:

```typescript
interface ChildContext {
  // What this child must implement
  interfaces: {
    [name: string]: {
      definition: string;  // TypeScript interface or description
      source: string;      // Which ancestor defined it
    };
  };
  
  // Rules this child must follow
  constraints: Array<{
    rule: string;
    source: string;
  }>;
  
  // Utilities this child can use
  utilities: Array<{
    name: string;
    signature: string;
    location: string;  // Where to import from
  }>;
}
```

**NOT passed automatically:**
- Suggestions (that's for `.aids` files)
- Grandparent's internal details (encapsulated by parent)
- Sibling information
- Everything from all ancestors

### Example: Selective Context Passing

```aid
database {
  Implements connection pooling and query execution.
  
  Interfaces:
  ```typescript
  interface DbConnection {
    query<T>(sql: string, params?: any[]): Promise<T[]>;
    transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  }
  ```
  
  The `connection` submodule implements pooling internals.
  - Give it the `logger` utility
  - Do NOT give it the DbConnection interface (it defines it)
  
  The `queries` submodule implements specific queries.
  - Give it the DbConnection interface
  - Give it the `logger` utility
  - Forward `logger` to its submodules
}
```

The parent decides:
- `connection` gets: `logger`
- `queries` gets: `DbConnection`, `logger`, instruction to forward `logger`

## Why Encapsulation Matters

**Without encapsulation** (accumulating all ancestor context):
- Children see irrelevant details from grandparents
- Token budgets explode for deep trees
- Changes in one branch leak into unrelated branches
- AI gets confused by too much context

**With encapsulation** (parent passes only what's needed):
- Children see exactly what they need
- Context size stays bounded regardless of tree depth
- Changes are isolated to affected branches
- AI has clear, focused instructions

## File Structure

```
.aid-gen/
├── root.aidg           # The compiled spec
├── root.aidg.map       # Source map (where each line came from)
├── root.aidq           # Questions for human review
├── server/
│   ├── node.aidg       # Server module spec
│   ├── node.aidg.map   # Server source map
│   └── api/
│       ├── node.aidg   # API module spec
│       └── node.aidg.map
```

**No `.aidc` files** - context is passed in-memory during compilation, not stored in files.

**Source maps** (`.aidg.map`) track traceability without polluting the readable `.aidg` files.

## Shared Utilities

### The Challenge

If agents can't read each other's outputs, how do shared utilities work?

### The Solution: Parent Declares, Child Implements

Parent declares a utility in prose:

```aid
root {
  Shared utilities:
  - hashPassword @ utils/hash.ts: (plain: string) => Promise<string>
  
  The `auth` module implements hashPassword.
  The `users` module can use hashPassword.
}
```

Parent passes to `auth`:
- Instruction to implement `hashPassword`
- The signature it must match

Parent passes to `users`:
- The `hashPassword` utility signature and location
- (NOT the implementation details)

Children use the signature:

```typescript
// users module knows signature from parent context
import { hashPassword } from '../utils/hash';

async function createUser(password: string) {
  const hash = await hashPassword(password);
}
```

## Utility Forwarding

Parents control what flows to grandchildren:

```aid
server {
  Has access to: logger, db
  
  api {
    // Parent explicitly forwards
    Give it: logger, db
    Tell it to forward logger to its children
  }
  
  internal {
    // Parent restricts access
    Give it: logger only
    Do NOT give it db access
  }
}
```

This is just prose—the AI understands and structures the context accordingly.

## Interface-Driven Design

The compiler LLM is prompted to be **interface-driven**:

1. **Extract interfaces** from the parent's prose
2. **Design child interfaces first** before spawning children
3. **Explicitly pass context** to each child (not broadcast everything)

This enables parallelization—all children can start as soon as parent defines their interfaces.

```aid
api {
  Interfaces all handlers must implement:
  ```typescript
  interface Handler {
    handle(req: Request): Promise<Response>;
  }
  ```
  
  Create handlers for:
  - users (CRUD operations)
  - auth (login, logout, refresh)
  - health (status check)
  
  All handlers receive the Handler interface.
  users and auth receive the db utility.
  health receives nothing extra.
}
```

## Anti-Patterns

### Don't: Implicit Dependencies

```aid
// BAD: Assumes sibling exists
auth { ... }
users { needs auth first }
```

### Do: Parent Provides Interface

```aid
// GOOD: Parent defines what children share
AuthService interface available to: auth (implements), users (uses)

auth { implements AuthService }
users { uses AuthService }
```

### Don't: Assume Grandparent Context

```aid
// BAD: Child assumes it has grandparent's utilities
deeply-nested-module {
  use the logger from root  // May not have been forwarded!
}
```

### Do: Trust What Parent Gave You

```aid
// GOOD: Use what you received
deeply-nested-module {
  use the logger utility  // Parent forwarded it explicitly
}
```

## Example: Multi-Level Flow

```
root.aid compiles:
  - Defines: AppConfig interface, Logger utility
  - Passes to server: AppConfig, Logger
  - Passes to cli: AppConfig (no Logger needed)

server compiles:
  - Receives: AppConfig, Logger
  - Defines: BaseService class
  - Passes to api: AppConfig, Logger, BaseService
  - Passes to worker: Logger only (doesn't need AppConfig)

api compiles:
  - Receives: AppConfig, Logger, BaseService
  - Defines: Handler interface
  - Passes to users: Handler, Logger
  - Passes to health: Handler only

users compiles (leaf):
  - Receives: Handler, Logger
  - Generates: users.ts implementing Handler, using Logger
```

Each level only knows what its parent passed. `users` has no idea about `BaseService` or `AppConfig`—its parent decided those weren't relevant.

## Source Maps

Source maps track where each piece came from without polluting `.aidg` files:

```json
// server/api/node.aidg.map
{
  "version": 3,
  "file": "node.aidg",
  "sources": ["../../../server.aid", "../../../root.aid"],
  "mappings": [
    {"line": 1, "source": "server.aid", "sourceLine": 45},
    {"line": 5, "source": "root.aid", "sourceLine": 12}
  ]
}
```

This enables:
- "Where did this constraint come from?" → trace to original `.aid` file
- "What generated code does this spec affect?" → trace forward to `build/`
- Analysis tools can correlate AI decisions with source lines

## Debugging

### Verbose Mode

```bash
aid . --verbose
```

Shows what each child receives:

```
Compiling server/api
  Parent passed:
    - Interfaces: AppConfig, Logger, BaseService (3)
    - Constraints: 2
    - Utilities: logger @ utils/logger.ts
  
  Generating children:
    - users: Handler, Logger
    - health: Handler
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Unknown utility" | Parent didn't forward it | Add forwarding instruction to parent |
| "Interface mismatch" | Child diverged from interface | Update constraint or implementation |
| "Missing context" | Expected something parent didn't pass | Update parent to pass it |
