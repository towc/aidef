/**
 * AIDef Type Definitions
 * 
 * This file defines all shared interfaces for the AIDef compiler.
 * 
 * Key concept: Context flows strictly parent → child. Parents decide what
 * each child receives (interfaces, constraints, utilities). No accumulation
 * of all ancestor context.
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
// Source Mapping (for traceability)
// =============================================================================

/**
 * Tracks the origin of content in the original .aid files.
 * Stored in .plan.aid.map files (not inline in .plan.aid).
 */
export interface SourceOrigin {
  /** Module path that defined this (e.g., "root", "server/api") */
  module: string;
  /** Original .aid file path */
  file: string;
  /** Line range in the original file */
  lines: {
    start: number;
    end: number;
  };
}

/**
 * Source map for a .plan.aid file.
 * Follows a simplified version of the JS source map format.
 * Also stores cache metadata for incremental builds.
 */
export interface SourceMap {
  /** Version (always 3 for compatibility) */
  version: 3;
  /** The .plan.aid file this maps */
  file: string;
  /** Original source files referenced */
  sources: string[];
  /** Line-by-line mappings */
  mappings: SourceMapping[];
  /** Cache metadata for incremental builds (optional) */
  cache?: CacheMetadata;
}

/**
 * Cache metadata stored in source maps for incremental builds.
 */
export interface CacheMetadata {
  /** Hash of the .plan.aid spec that produced this output */
  specHash: string;
  /** Hash of the parent context used during compilation */
  parentContextHash: string;
  /** Timestamp of compilation */
  compiledAt: string;
}

export interface SourceMapping {
  /** Line in the .plan.aid file (1-indexed) */
  generatedLine: number;
  /** Source file index (into sources array) */
  sourceIndex: number;
  /** Line in the source file (1-indexed) */
  sourceLine: number;
}

// =============================================================================
// Context Types (passed from parent to child)
// =============================================================================

/**
 * Context that a parent passes to a child during compilation.
 * 
 * This is NOT accumulated from all ancestors - the parent explicitly
 * decides what each child receives.
 */
export interface ChildContext {
  /** What interfaces this child should implement or can use */
  interfaces: Record<string, {
    definition: string;              // TypeScript interface or description
    source: string;                  // Which module defined it
  }>;
  
  /** Rules this child must follow */
  constraints: Array<{
    rule: string;
    source: string;
  }>;
  
  /** Utilities this child can use */
  utilities: Array<{
    name: string;
    signature: string;
    location: string;                // Import path
  }>;
  
  /** Instructions for what to forward to grandchildren */
  forwarding?: {
    /** Utility names to forward to all grandchildren */
    utilities?: string[];
  };
}

/**
 * Empty context for root node.
 */
export const EMPTY_CONTEXT: ChildContext = {
  interfaces: {},
  constraints: [],
  utilities: [],
};

// =============================================================================
// Question Types (.plan.aid.questions.json file content)
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
  
  /** Compile a node spec into child specs with their contexts */
  compile(request: CompileRequest): Promise<CompileResult>;
  
  /** Generate code from a leaf node */
  generate(request: GenerateRequest): Promise<GenerateResult>;
  
  /** Test if the provider is configured and working */
  testConnection(): Promise<boolean>;
}

export interface CompileRequest {
  /** The .plan.aid content for this node */
  spec: string;
  /** Context passed from parent (what this node can use) */
  context: ChildContext;
  /** Node path for logging (e.g., "server/api") */
  nodePath: string;
}

export interface CompileResult {
  /** Child specs with their contexts (parent decides what each child gets) */
  children: ChildSpec[];
  /** Questions for human review */
  questions: NodeQuestions['questions'];
  /** Considerations (non-blocking notes) */
  considerations: NodeQuestions['considerations'];
  /** Interfaces this node defines (for source map tracking) */
  interfaces: InterfaceDeclaration[];
  /** Constraints this node defines */
  constraints: ConstraintDeclaration[];
  /** Utilities this node defines */
  utilities: UtilityDeclaration[];
}

/**
 * A child module spec with its context.
 * Parent decides what context each child receives.
 */
export interface ChildSpec {
  /** Module name */
  name: string;
  /** Whether this is a leaf (no further children) */
  isLeaf: boolean;
  /** The spec content for the child's .plan.aid */
  spec: string;
  /** Context this child receives (from parent) */
  context: ChildContext;
}

export interface GenerateRequest {
  /** The .plan.aid content for this leaf node */
  spec: string;
  /** Context passed from parent */
  context: ChildContext;
  /** Node path for logging */
  nodePath: string;
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
// Declaration Types (extracted by AI during compilation)
// =============================================================================

export interface InterfaceDeclaration {
  name: string;
  definition: string;                // the interface code/description
  source: string;                    // which node declared this
}

export interface ConstraintDeclaration {
  rule: string;
  source: string;                    // which node declared this
}

export interface UtilityDeclaration {
  name: string;
  signature: string;
  location: string;                  // file path where it will be generated
  source: string;                    // which node declared this
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
  /** Maximum number of nodes to compile (default: 100) */
  maxNodes: number;
  /** Maximum number of AI calls to make (default: 100) */
  maxCalls: number;
  /** Maximum parallel compilations (default: 10) */
  maxParallel: number;
  /** Continue from previous state instead of restarting */
  continueFromState: boolean;
}

/**
 * Compilation state persisted to .aid-plan/state.json
 */
export interface CompilationStateFile {
  /** Version for future compatibility */
  version: 1;
  /** Timestamp when compilation started */
  startedAt: string;
  /** Timestamp of last update */
  updatedAt: string;
  /** Whether compilation completed successfully */
  completed: boolean;
  /** Nodes pending compilation (path -> ChildSpec JSON) */
  pendingNodes: Array<{
    path: string;
    spec: string;
    context: ChildContext;
    isLeaf: boolean;
  }>;
  /** Nodes that have been compiled */
  completedNodes: string[];
  /** Statistics */
  stats: CompilationStats;
}

/**
 * Statistics tracked during compilation
 */
export interface CompilationStats {
  /** Total nodes compiled */
  nodesCompiled: number;
  /** Total AI calls made */
  aiCalls: number;
  /** Times we hit the parallel limit and had to wait */
  parallelLimitHits: number;
  /** Times we hit the nodes limit */
  nodesLimitHits: number;
  /** Times we hit the calls limit */
  callsLimitHits: number;
  /** Total time spent waiting for parallel slots (ms) */
  parallelWaitTimeMs: number;
  /** Questions raised */
  questionsRaised: number;
  /** Errors encountered */
  errors: string[];
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


