/**
 * Provider Base Implementation Helpers
 * 
 * Shared utilities and base implementations for AI providers.
 */

import type {
  Provider,
  CompileRequest,
  CompileResult,
  GenerateRequest,
  GenerateResult,
  ChildContext,
  ChildSpec,
  InterfaceDeclaration,
  ConstraintDeclaration,
  UtilityDeclaration,
  NodeQuestions,
  GeneratedFile,
  RootNode,
  ModuleNode,
  ProseNode,
  QueryFilterNode,
  ASTNode,
} from '../types';
import { EMPTY_CONTEXT } from '../types';
import { tokenize } from '../parser/lexer.js';
import { parse } from '../parser/ast.js';

// =============================================================================
// Prompt Templates
// =============================================================================

/**
 * Build the system prompt for compilation phase.
 * 
 * The compiler phase takes a spec and produces:
 * 1. A .plan.aid file (the compiled spec for this node)
 * 2. Child module definitions with prose describing context
 */
export function buildCompileSystemPrompt(): string {
  return `You are a compiler that transforms specifications into modular execution plans.

## Your Role

You are compiling ONE NODE in a tree. Your job:
1. DESIGN INTERFACES FIRST - before anything else
2. Define child modules that can run IN PARALLEL
3. Describe in prose what context each child receives
4. Output in .plan.aid format (nginx-like syntax)

## Output Format

Output a .plan.aid file. Use ONLY these syntax patterns:
- \`name { }\` for module blocks
- \`"question?" { }\` for ambiguities
- \`leaf=true;\` parameter for leaf nodes
- Everything else is prose

Example:

\`\`\`
interfaces {
  \`\`\`typescript
  interface TodoItem {
    id: string;
    title: string;
    completed: boolean;
  }
  
  interface TodoStorage {
    get(id: string): Promise<TodoItem | null>;
    list(): Promise<TodoItem[]>;
    create(title: string): Promise<TodoItem>;
  }
  \`\`\`
}

storage {
  leaf=true;
  
  Implements the TodoStorage interface;
  Uses the TodoItem interface;
  In-memory Map-based storage;
}

api {
  REST endpoints for todo operations;
  
  Uses TodoItem and TodoStorage interfaces;
  Must use Bun.serve for HTTP;
  Must return JSON responses;
}

server {
  leaf=true;
  
  Entry point that wires everything together;
  Uses the TodoStorage interface;
  Port 3000, graceful shutdown on SIGINT;
  Must use Bun.serve;
}

"Should todos persist across restarts?" {
  Spec doesn't mention persistence;
  Assuming in-memory only;
  Would need storage refactor if wrong;
}
\`\`\`

## Critical Rules

### 1. INTERFACE-DRIVEN DESIGN
- Design ALL interfaces FIRST in an \`interfaces { }\` block
- Interfaces enable parallelization - children can compile simultaneously
- Use prose to describe what each child implements and uses

### 2. CONTEXT IN PROSE
Describe in natural language what each child needs:
- "Implements the X interface" - this child must implement X
- "Uses the Y interface" - this child receives Y to use
- "Must follow Z constraint" - rules the child must follow

Children ONLY know what you describe. They cannot see:
- Sibling modules
- Grandparent context (unless you forward it)
- The .aid-plan/ folder
- The build/ folder

### 3. LEAF NODES
Mark with \`leaf=true;\` parameter when:
- Module can be implemented in ~100-300 lines
- Single clear responsibility
- Further splitting would be artificial

### 4. PARALLELIZATION
All children compile IN PARALLEL. There is no sequential execution.
If child B needs child A's implementation, you need better interfaces.
Child B should receive A's INTERFACE, not wait for A's code.

### 5. NO RECURSIVE NAMES
Child names must be descriptive: "storage", "api", "validation"
NEVER name a child "root" or reuse the parent's name.

### 6. QUESTIONS
Use \`"question?" { }\` blocks for ambiguities. Include context and assumptions.`;
}

/**
 * Build the user prompt for compilation phase.
 */
export function buildCompileUserPrompt(request: CompileRequest): string {
  const contextSection = formatContext(request.context);
  
  // Check if the spec itself is marked as a leaf
  const isExplicitLeaf = /\bleaf\s*=\s*true\b/i.test(request.spec);
  
  if (isExplicitLeaf) {
    return `# Module: ${request.nodePath}

## Context From Parent
${contextSection}

## Specification
${request.spec}

---
This module is marked as leaf=true. Output a .plan.aid that preserves the spec.
Include prose describing what interfaces it implements/uses and what constraints apply.

Do NOT create child modules. This is a leaf node for code generation.`;
  }
  
  return `# Module: ${request.nodePath}

## Context From Parent
${contextSection}

## Specification
${request.spec}

---
Compile this specification into a .plan.aid file.

STEPS:
1. FIRST design interfaces in an \`interfaces { }\` block with TypeScript code
2. THEN define child modules with prose describing what each implements/uses
3. Mark simple modules with leaf=true parameter
4. Use "question?" { } blocks for ambiguities

Remember:
- Children are ISOLATED - describe in prose what context each receives
- Children run in PARALLEL - design interfaces so they don't wait on each other
- Child names must be descriptive (not "root", not parent's name)
- Use ONLY the allowed syntax: name { }, "question?" { }, leaf=true;, prose

Output .plan.aid content directly.`;
}

/**
 * Build the system prompt for generation phase.
 */
export function buildGenerateSystemPrompt(): string {
  return `You are a code generator that implements specifications.

## Your Role

You receive a LEAF NODE specification and generate working code.
You are ISOLATED - you can only use what's explicitly provided in your context.

## Output Format

Output a JSON object with files to generate:

{
  "files": [
    {
      "path": "storage.ts",
      "content": "// TypeScript code here..."
    }
  ],
  "questions": [
    {
      "id": "q1",
      "question": "Should this be async?",
      "assumption": "Yes, for flexibility",
      "impact": "Affects callers"
    }
  ]
}

## Isolation Rules (CRITICAL)

You can ONLY use:
1. Interfaces from your context - implement or use them as described
2. Constraints from your context - follow them exactly

You CANNOT:
- Reference sibling modules (you don't know they exist)
- Import from paths not in your context
- Read any files from the filesystem
- Access .aid-plan/ or build/ folders
- Make assumptions about other modules' implementations

## Code Guidelines

- TypeScript strict mode (unless spec says otherwise)
- Implement interfaces the spec says to implement
- Use interfaces the spec says to use
- Follow all constraints exactly
- Add JSDoc comments for public APIs
- Include error handling
- File paths are relative to build/ directory`;
}

/**
 * Build the user prompt for generation phase.
 */
export function buildGenerateUserPrompt(request: GenerateRequest): string {
  const contextSection = formatContext(request.context);
  
  return `# Leaf Module: ${request.nodePath}

## Your Context (ONLY use these)
${contextSection}

## Specification
${request.spec}

---
Generate the implementation.

Remember:
- ONLY use interfaces from your context
- FOLLOW all constraints from your context
- You are ISOLATED - no access to siblings or filesystem

Output JSON with "files" array. Each file has "path" and "content".`;
}

// =============================================================================
// Context Formatting
// =============================================================================

/**
 * Format ChildContext into a readable string for prompts.
 */
export function formatContext(context: ChildContext): string {
  const sections: string[] = [];
  
  // Interfaces
  if (Object.keys(context.interfaces).length > 0) {
    sections.push('### Available Interfaces');
    for (const [name, info] of Object.entries(context.interfaces)) {
      sections.push(`\n**${name}** (from ${info.source}):`);
      sections.push('```typescript');
      sections.push(info.definition);
      sections.push('```');
    }
  }
  
  // Constraints
  if (context.constraints.length > 0) {
    sections.push('\n### Constraints');
    for (const c of context.constraints) {
      sections.push(`- ${c.rule} (from ${c.source})`);
    }
  }
  
  // Utilities
  if (context.utilities.length > 0) {
    sections.push('\n### Available Utilities');
    for (const u of context.utilities) {
      sections.push(`- **${u.name}**: \`${u.signature}\` at ${u.location}`);
    }
  }
  
  if (sections.length === 0) {
    return 'No specific context provided.';
  }
  
  return sections.join('\n');
}

// =============================================================================
// Response Parsing
// =============================================================================

/**
 * Parse compile response from AI output (.plan.aid format).
 * 
 * Uses the existing lexer/parser - NO REGEX for parsing structure.
 * The AI outputs nginx-like .plan.aid format which we parse into an AST.
 * 
 * Context is passed in-memory from parent to child - the AI decides what
 * each child receives based on the prose content.
 */
export function parseCompileResponse(output: string): CompileResult {
  // Strip markdown code fences if present
  let content = output.trim();
  if (content.startsWith('```')) {
    const endFence = content.lastIndexOf('```');
    if (endFence > 3) {
      // Find end of first line (the ```lang part)
      const firstNewline = content.indexOf('\n');
      if (firstNewline !== -1 && firstNewline < endFence) {
        content = content.slice(firstNewline + 1, endFence).trim();
      }
    }
  }
  
  const result: CompileResult = {
    children: [],
    questions: [],
    considerations: [],
    interfaces: [],
    constraints: [],
    utilities: [],
  };
  
  // Parse using our lexer/parser
  const { tokens } = tokenize(content, 'ai-response.plan.aid');
  const { ast, errors } = parse(tokens, 'ai-response.plan.aid');
  
  if (errors.length > 0) {
    // Log parse errors but continue with what we got
    console.warn('Parse warnings in AI response:', errors.map(e => e.message).join(', '));
  }
  
  // Process AST nodes
  for (const node of ast.children) {
    if (node.type === 'module') {
      const moduleNode = node as ModuleNode;
      
      // Check for special blocks
      if (moduleNode.name === 'questions') {
        // Parse questions from the module's prose content
        result.questions.push(...extractQuestions(moduleNode));
        continue;
      }
      
      if (moduleNode.name === 'interfaces') {
        // Extract interface definitions from code blocks in prose
        result.interfaces.push(...extractInterfaces(moduleNode));
        continue;
      }
      
      // Regular child module
      const isLeaf = moduleNode.parameters.some(
        p => p.name === 'leaf' && (p.value === 'true' || p.value === true)
      );
      
      // Build spec from child's prose content
      const spec = extractProseContent(moduleNode);
      
      // Context is empty here - it will be populated by the parent's decision
      // The AI's prose describes what context each child should receive,
      // but the actual context object is built by the compilation logic
      result.children.push({
        name: moduleNode.name,
        isLeaf,
        spec,
        context: EMPTY_CONTEXT,
      });
    }
  }
  
  return result;
}

/**
 * Extract prose content from a module node.
 */
function extractProseContent(node: ModuleNode): string {
  const parts: string[] = [];
  
  for (const child of node.children) {
    if (child.type === 'prose') {
      parts.push((child as ProseNode).content);
    } else if (child.type === 'module') {
      // Nested module - serialize it back
      parts.push(serializeModule(child as ModuleNode));
    }
  }
  
  return parts.join('\n').trim();
}

/**
 * Serialize a module back to .plan.aid format.
 */
function serializeModule(node: ModuleNode): string {
  const params = node.parameters.map(p => `  ${p.name}=${typeof p.value === 'string' ? `"${p.value}"` : p.value};`).join('\n');
  const content = extractProseContent(node);
  const body = [params, content].filter(Boolean).join('\n');
  return `${node.name} {\n${body}\n}`;
}

/**
 * Extract interface declarations from an interfaces block.
 */
function extractInterfaces(node: ModuleNode): InterfaceDeclaration[] {
  const interfaces: InterfaceDeclaration[] = [];
  
  for (const child of node.children) {
    if (child.type === 'prose') {
      const content = (child as ProseNode).content;
      // Look for TypeScript code blocks
      // The prose may contain ```typescript ... ``` blocks
      // We extract interface names from them
      const codeBlockMatches = content.matchAll(/```typescript\s*([\s\S]*?)```/g);
      for (const match of codeBlockMatches) {
        const code = match[1];
        // Find interface declarations in the code
        const interfaceMatches = code.matchAll(/interface\s+(\w+)/g);
        for (const ifaceMatch of interfaceMatches) {
          // Extract the full interface definition
          const name = ifaceMatch[1];
          const startIdx = code.indexOf(`interface ${name}`);
          if (startIdx !== -1) {
            // Find matching brace
            let depth = 0;
            let endIdx = startIdx;
            let foundBrace = false;
            for (let i = startIdx; i < code.length; i++) {
              if (code[i] === '{') {
                depth++;
                foundBrace = true;
              } else if (code[i] === '}') {
                depth--;
                if (foundBrace && depth === 0) {
                  endIdx = i + 1;
                  break;
                }
              }
            }
            interfaces.push({
              name,
              definition: code.slice(startIdx, endIdx).trim(),
              source: 'compiled',
            });
          }
        }
      }
    }
  }
  
  return interfaces;
}

/**
 * Extract questions from a questions block.
 */
function extractQuestions(node: ModuleNode): NodeQuestions['questions'] {
  // Questions are in prose format within the questions block
  // The AI should format them in a way we can understand
  // For now, we just extract the prose as context for manual review
  const questions: NodeQuestions['questions'] = [];
  
  // Look for query_filter nodes which represent individual questions
  for (const child of node.children) {
    if (child.type === 'query_filter') {
      const qf = child as QueryFilterNode;
      const proseContent = qf.children
        .filter((c): c is ProseNode => c.type === 'prose')
        .map(p => p.content)
        .join(' ');
      
      questions.push({
        id: `q-${Math.random().toString(36).slice(2, 8)}`,
        question: qf.question,
        context: proseContent,
        assumption: '',
        impact: '',
      });
    }
  }
  
  return questions;
}

/**
 * Parse generate response from AI output.
 */
export function parseGenerateResponse(output: string): GenerateResult {
  const parsed = parseJsonResponse(output);
  
  return {
    files: (parsed.files || []).map((f: any): GeneratedFile => ({
      path: String(f.path || 'unknown.ts'),
      content: String(f.content || ''),
    })),
    questions: (parsed.questions || []).map((q: any) => ({
      id: String(q.id || `q-${Math.random().toString(36).slice(2, 8)}`),
      question: String(q.question || ''),
      context: String(q.context || ''),
      options: q.options,
      assumption: String(q.assumption || ''),
      impact: String(q.impact || ''),
    })),
    considerations: (parsed.considerations || []).map((c: any) => ({
      id: String(c.id || `c-${Math.random().toString(36).slice(2, 8)}`),
      note: String(c.note || ''),
      blocking: Boolean(c.blocking),
    })),
  };
}

/**
 * Parse JSON from AI response, handling markdown code blocks.
 */
function parseJsonResponse(output: string): any {
  // Try direct parse first
  try {
    return JSON.parse(output);
  } catch {
    // Ignore and try extracting from code blocks
  }
  
  // Try to extract from markdown code block
  const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // Ignore and try next approach
    }
  }
  
  // Try to find JSON object in the response
  const jsonStart = output.indexOf('{');
  const jsonEnd = output.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      return JSON.parse(output.slice(jsonStart, jsonEnd + 1));
    } catch {
      // Fall through to error
    }
  }
  
  throw new Error(`Failed to parse JSON from AI response: ${output.slice(0, 200)}...`);
}

// =============================================================================
// Default Empty Context
// =============================================================================

/**
 * Create an empty ChildContext for testing or defaults.
 */
export function createEmptyContext(): ChildContext {
  return { ...EMPTY_CONTEXT };
}

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique call ID.
 */
export function generateCallId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}
