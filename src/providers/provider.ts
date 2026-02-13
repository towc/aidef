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
  NodeContext,
  ChildSpec,
  InterfaceDeclaration,
  Constraint,
  Suggestion,
  UtilityDeclaration,
  NodeQuestions,
  GeneratedFile,
} from '../types';

// =============================================================================
// Prompt Templates
// =============================================================================

/**
 * Build the system prompt for compilation phase.
 */
export function buildCompileSystemPrompt(): string {
  return `You are an AI assistant that helps break down software specifications into modular components.

Your task is to analyze a specification and decompose it into child modules. Each child should be:
- Cohesive: focused on a single responsibility
- Well-named: clear, descriptive identifier
- Appropriately sized: not too broad, not too granular

Output your response as JSON with this exact structure:
{
  "children": [
    {
      "name": "moduleName",
      "isLeaf": false,
      "spec": "The specification content for this child module...",
      "tags": ["tag1", "tag2"]
    }
  ],
  "questions": [
    {
      "id": "q1",
      "question": "What is the expected format?",
      "context": "The spec mentions data format but doesn't specify",
      "options": [{"label": "JSON"}, {"label": "YAML"}],
      "assumption": "Assuming JSON format",
      "impact": "Affects serialization implementation"
    }
  ],
  "considerations": [
    {
      "id": "c1",
      "note": "Consider adding rate limiting",
      "blocking": false
    }
  ],
  "interfaces": [
    {
      "name": "InterfaceName",
      "definition": "interface InterfaceName { ... }",
      "source": "module/path"
    }
  ],
  "constraints": [
    {
      "rule": "Must validate all inputs",
      "source": "module/path",
      "important": true
    }
  ],
  "suggestions": [
    {
      "rule": "Consider using dependency injection",
      "source": "module/path"
    }
  ],
  "utilities": []
}

Rules:
- If a module is small enough to implement directly, mark isLeaf: true
- Extract any interfaces that child modules will need to share
- Note any ambiguities as questions with reasonable assumptions
- Mark constraints that MUST be followed vs suggestions that SHOULD be considered`;
}

/**
 * Build the user prompt for compilation phase.
 */
export function buildCompileUserPrompt(request: CompileRequest): string {
  const contextSection = formatContext(request.context);
  
  return `# Module: ${request.nodePath}

## Context
${contextSection}

## Specification
${request.spec}

---
Analyze this specification and break it down into child modules. Return JSON only, no markdown code blocks.`;
}

/**
 * Build the system prompt for generation phase.
 */
export function buildGenerateSystemPrompt(): string {
  return `You are an AI assistant that generates code from specifications.

Your task is to implement the specification as working code. Follow these principles:
- Write clean, idiomatic code
- Include appropriate error handling
- Add JSDoc comments for public interfaces
- Follow the constraints provided in the context

Output your response as JSON with this exact structure:
{
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "content": "// File content here..."
    }
  ],
  "questions": [
    {
      "id": "q1",
      "question": "Should this function be async?",
      "context": "The spec doesn't specify sync vs async behavior",
      "assumption": "Implementing as async for flexibility",
      "impact": "Affects caller implementation"
    }
  ],
  "considerations": [
    {
      "id": "c1",
      "note": "Consider adding unit tests",
      "blocking": false
    }
  ]
}

Rules:
- Generate all necessary files to implement the spec
- Use TypeScript unless the spec indicates otherwise
- Respect all constraints from the context (especially those marked important)
- File paths should be relative to the build output directory`;
}

/**
 * Build the user prompt for generation phase.
 */
export function buildGenerateUserPrompt(request: GenerateRequest): string {
  const contextSection = formatContext(request.context);
  
  return `# Module: ${request.nodePath}

## Context
${contextSection}

## Specification
${request.spec}

---
Generate the implementation code for this leaf module. Return JSON only, no markdown code blocks.`;
}

// =============================================================================
// Context Formatting
// =============================================================================

/**
 * Format NodeContext into a readable string for prompts.
 */
export function formatContext(context: NodeContext): string {
  const sections: string[] = [];
  
  // Module info
  sections.push(`Module: ${context.module}`);
  sections.push(`Ancestry: ${context.ancestry.join(' > ')}`);
  
  if (context.tags.length > 0) {
    sections.push(`Tags: ${context.tags.join(', ')}`);
  }
  
  // Interfaces
  if (Object.keys(context.interfaces).length > 0) {
    sections.push('\n### Available Interfaces');
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
      const prefix = c.important ? '**[MUST]**' : '[SHOULD]';
      sections.push(`- ${prefix} ${c.rule} (from ${c.source})`);
    }
  }
  
  // Suggestions
  if (context.suggestions.length > 0) {
    sections.push('\n### Suggestions');
    for (const s of context.suggestions) {
      sections.push(`- ${s.rule} (from ${s.source})`);
    }
  }
  
  // Utilities
  if (context.utilities.length > 0) {
    sections.push('\n### Available Utilities');
    for (const u of context.utilities) {
      sections.push(`- **${u.name}**: \`${u.signature}\` at ${u.location}`);
    }
  }
  
  // Conventions
  if (context.conventions.length > 0) {
    sections.push('\n### Conventions');
    for (const c of context.conventions) {
      sections.push(`- ${c.rule} (${c.selector} from ${c.source})`);
    }
  }
  
  return sections.join('\n');
}

// =============================================================================
// Response Parsing
// =============================================================================

/**
 * Parse compile response from AI output.
 */
export function parseCompileResponse(output: string): CompileResult {
  const parsed = parseJsonResponse(output);
  
  return {
    children: (parsed.children || []).map((c: any): ChildSpec => ({
      name: String(c.name || 'unnamed'),
      isLeaf: Boolean(c.isLeaf),
      spec: String(c.spec || ''),
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
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
    interfaces: (parsed.interfaces || []).map((i: any): InterfaceDeclaration => ({
      name: String(i.name || 'Unknown'),
      definition: String(i.definition || ''),
      source: String(i.source || ''),
    })),
    constraints: (parsed.constraints || []).map((c: any): Constraint => ({
      rule: String(c.rule || ''),
      source: String(c.source || ''),
      important: Boolean(c.important),
    })),
    suggestions: (parsed.suggestions || []).map((s: any): Suggestion => ({
      rule: String(s.rule || ''),
      source: String(s.source || ''),
    })),
    utilities: (parsed.utilities || []).map((u: any): UtilityDeclaration => ({
      name: String(u.name || ''),
      signature: String(u.signature || ''),
      location: String(u.location || ''),
      source: String(u.source || ''),
    })),
  };
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
 * Create an empty NodeContext for testing or defaults.
 */
export function createEmptyContext(module: string = 'root'): NodeContext {
  return {
    module,
    ancestry: [module],
    tags: [],
    interfaces: {},
    constraints: [],
    suggestions: [],
    utilities: [],
    conventions: [],
  };
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
