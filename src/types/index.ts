/**
 * AIDef Type Definitions
 * 
 * This file defines all shared interfaces for the AIDef compiler.
 * Updated for nginx-like syntax (not CSS-like).
 */

// =============================================================================
// Source Location (shared across parser components)
// =============================================================================

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  offset: number;  // byte offset in file
}

export interface SourceRange {
  start: SourceLocation;
  end: SourceLocation;
}

// =============================================================================
// Lexer Types
// =============================================================================

export type TokenType =
  | 'identifier'      // server, auth, myModule
  | 'string'          // "..." (for query filters and param values)
  | 'number'          // 123 (for param values like priority=1)
  | 'brace_open'      // {
  | 'brace_close'     // }
  | 'semicolon'       // ;
  | 'equals'          // =
  | 'include'         // include keyword
  | 'comment'         // /* */ or //
  | 'code_block'      // ```...```
  | 'inline_code'     // `...`
  | 'text'            // plain text content (prose)
  | 'newline'         // \n
  | 'whitespace'      // spaces/tabs
  | 'eof';            // end of file

export interface Token {
  type: TokenType;
  value: string;
  location: SourceLocation;
}

export interface LexerResult {
  tokens: Token[];
  errors: LexerError[];
}

export interface LexerError {
  message: string;
  location: SourceLocation;
}

// =============================================================================
// AST Types (nginx-like syntax)
// =============================================================================

export type ASTNode =
  | RootNode
  | ModuleNode
  | QueryFilterNode
  | ProseNode
  | IncludeNode
  | ParameterNode;

export interface RootNode {
  type: 'root';
  children: ASTNode[];
  source: SourceRange;
}

/**
 * A module block: `name { ... }`
 */
export interface ModuleNode {
  type: 'module';
  name: string;
  parameters: ParameterNode[];       // leaf="reason", path="./src", etc.
  children: ASTNode[];
  source: SourceRange;
}

/**
 * A query filter block: `"is this a database?" { ... }`
 * The question is evaluated by LLM for each module.
 */
export interface QueryFilterNode {
  type: 'query_filter';
  question: string;                  // The question to ask the LLM
  children: ASTNode[];
  source: SourceRange;
}

/**
 * Prose content (natural language specification).
 */
export interface ProseNode {
  type: 'prose';
  content: string;
  source: SourceRange;
}

/**
 * Include statement: `include ./path;`
 */
export interface IncludeNode {
  type: 'include';
  path: string;                      // ./file or ./file.aid
  resolved?: ResolvedImport;         // filled in during import resolution
  source: SourceRange;
}

/**
 * Parameter: `name="value";` or `name=123;`
 * Used for module metadata like leaf, never, optional, path, priority, model.
 */
export interface ParameterNode {
  type: 'parameter';
  name: string;
  value: string | number;
  source: SourceRange;
}

// =============================================================================
// Import Resolution Types
// =============================================================================

export interface ResolvedImport {
  originalPath: string;
  resolvedPath: string;              // absolute path
  isAidFile: boolean;                // .aid files get parsed, others are prose
  ast?: RootNode;                    // parsed AST if .aid file
  content?: string;                  // raw content if non-.aid file
}

export interface ResolvedSpec {
  ast: RootNode;
  imports: Map<string, ResolvedImport>;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  location: SourceRange;
  severity: 'error' | 'warning';
}

// =============================================================================
// Recognized Parameters
// =============================================================================

/**
 * Parameters that AIDef recognizes and acts on.
 * Unrecognized parameters trigger a warning but are passed to the AI.
 */
export const RECOGNIZED_PARAMETERS = [
  'leaf',       // leaf="reason" - don't subdivide this module
  'never',      // never="reason" - forbid this submodule
  'optional',   // optional="reason" - may be skipped
  'priority',   // priority=1 - compilation order (lower first)
  'path',       // path="./src" - output path override
  'model',      // model="opus" - LLM model override
] as const;

export type RecognizedParameter = typeof RECOGNIZED_PARAMETERS[number];

// =============================================================================
// Compiled Node Types (output of compilation phase)
// =============================================================================

export interface CompiledNode {
  name: string;
  path: string;                      // e.g., "server/api"
  ancestry: string[];                // ["root", "server", "api"]
  
  // Content
  prose: string;                     // the natural language spec
  
  // Structure
  children: string[];                // child module names
  isLeaf: boolean;                   // no children = leaf
  
  // Parameters
  parameters: Record<string, string | number>;
  
  // Extracted metadata
  interfaces: InterfaceDeclaration[];
  constraints: Constraint[];
  suggestions: Suggestion[];
  utilities: UtilityDeclaration[];
}

export interface InterfaceDeclaration {
  name: string;
  definition: string;                // the interface code/description
  source: string;                    // which node declared this
}

export interface Constraint {
  rule: string;
  source: string;                    // which node declared this
}

export interface Suggestion {
  rule: string;
  source: string;
}

export interface UtilityDeclaration {
  name: string;
  signature: string;
  location: string;                  // file path where it will be generated
  source: string;                    // which node declared this
}

// =============================================================================
// Context Types (.aidc file content)
// =============================================================================

/**
 * Tracks the origin of a rule/constraint in the original .aid files.
 * Enables full traceability: build/ file → module → .aidc → original .aid files
 */
export interface SourceOrigin {
  /** Module path that defined this (e.g., "root", "server/api") */
  module: string;
  /** Original .aid file path (if known) */
  file?: string;
  /** Line range in the original file (if known) */
  lines?: {
    start: number;
    end: number;
  };
}

export interface NodeContext {
  module: string;
  ancestry: string[];
  
  // Parameters from this node and ancestors
  parameters: Record<string, string | number>;
  
  interfaces: Record<string, {
    source: string;              // module path (legacy)
    sourceOrigin?: SourceOrigin; // detailed origin
    definition: string;
  }>;
  
  constraints: Array<{
    rule: string;
    source: string;              // module path (legacy)
    sourceOrigin?: SourceOrigin; // detailed origin
  }>;
  
  suggestions: Array<{
    rule: string;
    source: string;              // module path (legacy)
    sourceOrigin?: SourceOrigin; // detailed origin
  }>;
  
  utilities: Array<{
    name: string;
    signature: string;
    location: string;
    source: string;              // module path (legacy)
    sourceOrigin?: SourceOrigin; // detailed origin
  }>;
  
  // Query filters that matched this module
  queryFilters: Array<{
    question: string;
    content: string;             // the prose inside the filter block
    sourceOrigin?: SourceOrigin;
  }>;
}

// =============================================================================
// Question Types (.aidq file content)
// =============================================================================

export interface NodeQuestions {
  module: string;
  
  questions: Array<{
    id: string;
    question: string;
    context: string;
    options?: Array<{
      label: string;
      description?: string;
    }>;
    assumption: string;
    impact: string;
    answer?: string;
    answeredBy?: string;
    answeredAt?: string;
  }>;
  
  considerations: Array<{
    id: string;
    note: string;
    blocking: boolean;
  }>;
}

// =============================================================================
// Provider Types
// =============================================================================

export interface Provider {
  name: string;
  
  /** Compile a node spec into child specs */
  compile(request: CompileRequest): Promise<CompileResult>;
  
  /** Generate code from a leaf node */
  generate(request: GenerateRequest): Promise<GenerateResult>;
  
  /** Test if the provider is configured and working */
  testConnection(): Promise<boolean>;
}

export interface CompileRequest {
  spec: string;                      // the .aidg content
  context: NodeContext;              // from .aidc
  nodePath: string;                  // for logging
}

export interface CompileResult {
  children: ChildSpec[];
  questions: NodeQuestions['questions'];
  considerations: NodeQuestions['considerations'];
  
  // For .aidc generation
  interfaces: InterfaceDeclaration[];
  constraints: Constraint[];
  suggestions: Suggestion[];
  utilities: UtilityDeclaration[];
}

export interface ChildSpec {
  name: string;
  isLeaf: boolean;
  spec: string;                      // content for child's .aidg
}

export interface GenerateRequest {
  spec: string;                      // the .aidg content
  context: NodeContext;              // from .aidc
  nodePath: string;                  // for logging
}

export interface GenerateResult {
  files: GeneratedFile[];
  questions: NodeQuestions['questions'];
  considerations: NodeQuestions['considerations'];
}

export interface GeneratedFile {
  path: string;                      // relative to build/
  content: string;
}

// =============================================================================
// Call Log Types
// =============================================================================

export interface CallLogEntry {
  id: string;
  timestamp: string;                 // ISO 8601
  node: string;                      // e.g., "root" or "server/api"
  phase: 'compile' | 'generate';
  provider: string;
  model: string;
  
  // Full content
  input: string;
  output: string;
  
  // Metrics
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  
  success: boolean;
  error?: string;
}

// =============================================================================
// CLI Types
// =============================================================================

export interface CLIOptions {
  command: 'run' | 'browse' | 'build' | 'auth' | 'estimate' | 'analyze';
  rootPath: string;
  verbose: boolean;
  maxCost?: number;
}

export interface CompilationProgress {
  phase: 'parsing' | 'resolving' | 'compiling' | 'done';
  currentNode?: string;
  completedNodes: number;
  totalNodes: number;
  questions: NodeQuestions['questions'];
  errors: ParseError[];
}

// =============================================================================
// Config Types
// =============================================================================

export interface AIDConfig {
  provider?: {
    default?: string;
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
    [key: string]: ProviderConfig | string | undefined;
  };
  model?: {
    compile?: string;
    generate?: string;
  };
  maxCost?: number;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}
