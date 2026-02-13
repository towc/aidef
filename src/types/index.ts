/**
 * AIDef Type Definitions
 * 
 * This file defines all shared interfaces for the AIDef compiler.
 * Teams can work on different modules in parallel as long as they
 * respect these interface contracts.
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
  | 'brace_open'      // {
  | 'brace_close'     // }
  | 'paren_open'      // (
  | 'paren_close'     // )
  | 'dot'             // .
  | 'colon'           // :
  | 'star'            // *
  | 'plus'            // +
  | 'tilde'           // ~
  | 'gt'              // >
  | 'import'          // @path (the whole @path as one token)
  | 'important'       // !important
  | 'comment'         // /* */ or //
  | 'code_block'      // ```...```
  | 'inline_code'     // `...`
  | 'prose'           // plain text content
  | 'newline'         // \n
  | 'whitespace'      // spaces/tabs (usually skipped)
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
// AST Types
// =============================================================================

export type ASTNode =
  | RootNode
  | ModuleNode
  | TagBlockNode
  | UniversalBlockNode
  | PseudoBlockNode
  | ProseNode
  | ImportNode
  | ConstraintNode;

export interface RootNode {
  type: 'root';
  children: ASTNode[];
  source: SourceRange;
}

export interface ModuleNode {
  type: 'module';
  name: string;
  tags: string[];                    // .tag1.tag2 attached to module
  pseudos: PseudoSelector[];         // :has(), :not(), etc.
  combinator?: Combinator;           // how it relates to parent
  children: ASTNode[];
  source: SourceRange;
}

export interface TagBlockNode {
  type: 'tag_block';
  tags: string[];                    // .tag1.tag2
  pseudos: PseudoSelector[];
  children: ASTNode[];
  source: SourceRange;
}

export interface UniversalBlockNode {
  type: 'universal_block';           // * { }
  pseudos: PseudoSelector[];
  children: ASTNode[];
  source: SourceRange;
}

export interface PseudoBlockNode {
  type: 'pseudo_block';              // :leaf { }, :root { }
  pseudo: PseudoSelector;
  children: ASTNode[];
  source: SourceRange;
}

export interface ProseNode {
  type: 'prose';
  content: string;
  important: boolean;                // ends with !important
  source: SourceRange;
}

export interface ImportNode {
  type: 'import';
  path: string;                      // ./file or ./file.aid or url
  resolved?: ResolvedImport;         // filled in during import resolution
  source: SourceRange;
}

export interface ConstraintNode {
  type: 'constraint';
  content: string;
  important: boolean;
  source: SourceRange;
}

// Selector components
export type Combinator = 
  | 'descendant'     // space: parent child
  | 'child'          // >: parent > child
  | 'adjacent'       // +: sibling + sibling
  | 'general';       // ~: sibling ~ sibling

export interface PseudoSelector {
  name: string;                      // 'leaf', 'root', 'has', 'not', 'or'
  args?: string[];                   // for :has(x), :not(x), :or(a, b)
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
  
  // Extracted metadata
  interfaces: InterfaceDeclaration[];
  constraints: Constraint[];
  suggestions: Suggestion[];
  utilities: UtilityDeclaration[];
  tags: string[];
}

export interface InterfaceDeclaration {
  name: string;
  definition: string;                // the interface code/description
  source: string;                    // which node declared this
}

export interface Constraint {
  rule: string;
  source: string;                    // which node declared this
  important: boolean;
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
  tags: string[];
  
  interfaces: Record<string, {
    source: string;              // module path (legacy)
    sourceOrigin?: SourceOrigin; // detailed origin (new)
    definition: string;
  }>;
  
  constraints: Array<{
    rule: string;
    source: string;              // module path (legacy)
    sourceOrigin?: SourceOrigin; // detailed origin (new)
    important: boolean;
  }>;
  
  suggestions: Array<{
    rule: string;
    source: string;              // module path (legacy)
    sourceOrigin?: SourceOrigin; // detailed origin (new)
  }>;
  
  utilities: Array<{
    name: string;
    signature: string;
    location: string;
    source: string;              // module path (legacy)
    sourceOrigin?: SourceOrigin; // detailed origin (new)
  }>;
  
  conventions: Array<{
    rule: string;
    source: string;              // module path (legacy)
    sourceOrigin?: SourceOrigin; // detailed origin (new)
    selector: string;            // which selector matched
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
  tags: string[];
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
  command: 'run' | 'browse' | 'build' | 'auth' | 'estimate';
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
