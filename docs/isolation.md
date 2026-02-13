# Agent Isolation and Context Passing

## The Isolation Principle

AIDef's core architectural principle: **each compilation agent is sandboxed**. This enables:

1. **True parallelization**: No shared mutable state between agents
2. **Reproducibility**: Same inputs always yield same outputs
3. **Modularity enforcement**: Agents can't "cheat" by reading siblings

## What Each Agent Can Access

### Allowed (Whitelist)

| Resource | Description |
|----------|-------------|
| Current `.aid` file | The specification being processed |
| Parent context | Text output from parent node (interfaces, signatures) |
| Explicitly referenced files | Files marked with `@ref` in the `.aid` |
| Environment variables | Variables marked with `@env` in the `.aid` |
| Answered questions | Resolved `.aiq` entries for this node |

### Forbidden (Blacklist)

| Resource | Why |
|----------|-----|
| Other `.aid` files | Would break isolation, enable implicit coupling |
| `.aid/` folder contents | Build artifacts shouldn't influence builds |
| `build/` folder contents | Generated code shouldn't influence generation |
| Sibling node outputs | Siblings are parallel; can't have dependencies |
| Grandparent context | Must be explicitly passed through parent |

## Context Passing Mechanism

### Parent → Child Flow

```
root.aid
    │
    │ [Agent compiles root.aid]
    │
    ▼
┌─────────────────────────────────────┐
│ Output (text, not files):           │
│                                     │
│ interfaces:                         │
│   AuthService: login, logout        │
│   UserService: create, findById     │
│                                     │
│ utilities:                          │
│   hashPassword @ utils/hash.ts      │
│   validateEmail @ utils/validate.ts │
│                                     │
│ conventions:                        │
│   - Use zod for validation          │
│   - Errors extend BaseError         │
└─────────────────────────────────────┘
    │
    ├──────────────────┬──────────────────┐
    │                  │                  │
    ▼                  ▼                  ▼
auth/node.aid    users/node.aid    config.aid
(receives above) (receives above)  (receives above)
```

### What Gets Passed

1. **Interface definitions**: Types, function signatures
2. **Utility signatures**: What shared utilities exist and where
3. **Conventions**: Patterns established by ancestors
4. **Constraints**: `@strict` requirements that apply downstream

### What Doesn't Get Passed

1. **Implementation details**: How things work internally
2. **Intermediate reasoning**: Why decisions were made
3. **Sibling information**: What parallel nodes are doing

## Implementing Shared Utilities

### The Challenge

If agents can't read each other's outputs, how do shared utilities work?

### The Solution: Declare, Don't Define

Parent node **declares** the utility interface:
```
Utility: hashPassword
Signature: (plain: string) => Promise<string>
Location: utils/hash.ts
```

Child nodes **use** this declaration without reading the file:
```typescript
// Child knows the signature from parent context
import { hashPassword } from '../utils/hash';

async function createUser(password: string) {
  const hash = await hashPassword(password);
  // ...
}
```

### Utility Generation

A dedicated leaf node generates the actual utility files:
```
.aid/
├── utils.aid          # Leaf: generates all utility files
├── auth/
│   └── node.aid       # Uses utility signatures (doesn't read files)
└── users/
    └── node.aid       # Uses utility signatures (doesn't read files)
```

The build phase ensures `utils.aid` executes before dependents.

## Interface Contracts

### Strict Interface Mode

When a parent declares an interface, children must honor it:

```aid
# In parent node.aid

## Interfaces (STRICT)

Children implementing AuthService MUST match this exactly:

```typescript
interface AuthService {
  login(email: string, password: string): Promise<Session>;
  logout(sessionId: string): Promise<void>;
}
```
```

### Flexible Interface Mode

For less critical interfaces:

```aid
## Interfaces (FLEXIBLE)

Children MAY extend this interface:

```typescript
interface Logger {
  info(message: string): void;
  error(message: string, error?: Error): void;
  // Children may add: debug, warn, etc.
}
```
```

## Enforcement Mechanisms

### Compilation-Time Checks

The compiler verifies:
1. Child outputs conform to parent-declared interfaces
2. No forbidden file access patterns in generated code
3. Utility imports match declared signatures

### Runtime Sandboxing

During compilation, each agent runs in isolation:
- Separate process/context
- File system access restricted to whitelist
- Network access disabled (AI calls through controlled API)

## Example: Multi-Level Context Flow

```
root.aid
├── Declares: AppConfig interface
├── Declares: Logger utility @ utils/logger.ts
│
└── services/node.aid (receives: AppConfig, Logger)
    ├── Declares: BaseService abstract class
    ├── Declares: validateInput utility @ services/validate.ts
    │
    ├── auth/node.aid (receives: AppConfig, Logger, BaseService, validateInput)
    │   ├── Declares: AuthService interface
    │   │
    │   ├── session.aid (receives: all above + AuthService)
    │   │   └── Generates: session.ts (implements part of AuthService)
    │   │
    │   └── password.aid (receives: all above + AuthService)
    │       └── Generates: password.ts (implements part of AuthService)
    │
    └── users/node.aid (receives: AppConfig, Logger, BaseService, validateInput)
        └── ...
```

Each level only passes what children need—no more, no less.

## Anti-Patterns

### Don't: Implicit Dependencies

```aid
# BAD: Assumes sibling exists
@module auth
@module users - needs auth to be compiled first
```

### Do: Explicit Context

```aid
# GOOD: Parent provides what's needed
## Shared Context for Children
- AuthService interface (defined above)
- All children receive this interface

@module auth - implements AuthService
@module users - consumes AuthService
```

### Don't: File Path Assumptions

```aid
# BAD: Hardcoded paths
Import from ../../auth/session.ts
```

### Do: Declared Utilities

```aid
# GOOD: Declared in parent
Utility: getSession @ auth/session.ts
Children import from declared location
```

## Debugging Isolation Issues

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Cannot resolve import" | Undeclared utility | Add to parent's utility declarations |
| "Interface mismatch" | Child diverged from parent | Update child or parent interface |
| "Forbidden file access" | Tried to read sibling | Pass needed info through parent |

### Verbose Mode

```bash
aid . --verbose
```

Shows context passed to each node:
```
Compiling auth/session.aid
  Context received:
    - Interfaces: AuthService, Session
    - Utilities: hashPassword, validateEmail
    - Conventions: 3 items
    - Constraints: 2 @strict requirements
```
