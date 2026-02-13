# AIDef Bootstrap

## Overview

The bootstrapper is a minimal CLI tool that can understand `.aid` files and generate code output. It exists to solve the chicken-and-egg problem: AIDef needs to be built before it can build itself.

The bootstrapper is intentionally simple:
- No parsing of `.aid` syntax (the LLM understands it directly)
- No complex orchestration or parallelization
- LLM uses tools to read files and write output
- Outputs generated code to `src/`

## How It Works

```
root.aid → Bootstrapper → LLM (with tools) → src/
```

1. **Start**: Send `root.aid` content to LLM with system prompt
2. **Read**: LLM uses `read_file` tool to read included files as needed
3. **Generate**: LLM produces code based on the specification
4. **Write**: LLM uses `write_file` tool to save files (restricted to `src/`)

## Tools

The LLM has access to two tools:

### `read_file`
- **Purpose**: Read `.aid` files or other referenced files
- **Input**: `{ path: string }` - relative path from project root
- **Output**: File contents as string
- **No restrictions**: Can read any file in the project

### `write_file`
- **Purpose**: Write generated code files
- **Input**: `{ path: string, content: string }`
- **Output**: Confirmation
- **Restricted to `src/`**: Path must start with `src/`

## The System Prompt

The system prompt teaches the LLM:
- What `.aid` files are (specifications for code generation)
- The minimal syntax (module blocks, includes, prose)
- How to use the read/write tools
- That output must go to `src/`

The actual `.aid` language definition lives in `root.aid` itself - the bootstrapper's system prompt is just enough to get started.

## CLI Usage

```bash
# Run the bootstrapper on root.aid
bun run bootstrap.ts

# Or with a specific file
bun run bootstrap.ts path/to/spec.aid
```

## Output

The bootstrapper writes files to `src/`:

```
src/
├── index.ts
├── parser/
│   └── ...
├── compiler/
│   └── ...
└── cli/
    └── ...
```

## Limitations

The bootstrapper is intentionally limited:
- No incremental builds (regenerates everything)
- No caching
- No parallel compilation

These features will exist in the full AIDef implementation (which will be generated from `root.aid` using this bootstrapper).

## Implementation

The bootstrapper is a single TypeScript file: `bootstrap.ts`

Dependencies:
- Bun runtime
- Vercel AI SDK (`ai` package)
- An LLM provider (Gemini, Anthropic, or OpenAI)

## Environment Variables

```
GEMINI_API_KEY=...    # For Google Gemini
ANTHROPIC_API_KEY=... # For Anthropic Claude  
OPENAI_API_KEY=...    # For OpenAI GPT
```

The bootstrapper uses whichever key is available, preferring in the order listed.
