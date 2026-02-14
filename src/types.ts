/**
 * AIDef Type Definitions
 * 
 * These interfaces define the core data structures used throughout the compiler and runtime.
 */

// =============================================================================
// Parser Types
// =============================================================================

/** A parameter like `key=value;` */
export interface AidParam {
  type: 'param';
  name: string;
  value: string;
}

/** A module block like `name { content }` */
export interface AidModule {
  type: 'module';
  name: string;
  content: AidNode[];
}

/** An include statement like `include path;` */
export interface AidInclude {
  type: 'include';
  path: string;
}

/** Prose text (everything else) */
export interface AidProse {
  type: 'prose';
  text: string;
}

/** Any node in the parsed AST */
export type AidNode = AidParam | AidModule | AidInclude | AidProse;

/** Result of parsing a .aid file */
export interface ParsedAid {
  nodes: AidNode[];
  /** Modules found at any level, keyed by name */
  modules: Map<string, AidModule>;
  /** Parameters found at the top level */
  params: Map<string, string>;
}

// =============================================================================
// Compilation Types
// =============================================================================

/** A compiled node (.gen.aid file) */
export interface GenNode {
  /** Path to this node's .gen.aid file */
  path: string;
  /** The .aid content (with includes resolved) */
  content: string;
  /** Hash of content for diffing */
  hash: string;
  /** Child nodes spawned by this node */
  children: GenNode[];
  /** Leaf nodes spawned by this node */
  leaves: GenLeaf[];
}

/** A leaf node (.gen.aid.leaf.json file) */
export interface GenLeaf {
  /** Path to this leaf's JSON file */
  path: string;
  /** Directory where this leaf's JSON lives (compilation artifact) */
  dir: string;
  /** Output path where files should be written (relative to project root, from path= param) */
  outputPath: string;
  /** Prompt containing all context for code generation */
  prompt: string;
  /** Files this leaf is allowed to write (relative to outputPath) */
  files: string[];
  /** Commands to run (must be whitelisted) */
  commands: string[];
}

/** Arguments for gen_node tool call */
export interface GenNodeArgs {
  /** Name of the child node (becomes folder name) */
  name: string;
  /** 
   * Interface this node will provide to siblings.
   * Must specify: files it creates, exports from each file.
   */
  interface: {
    files: string[];
    exports: Record<string, string[]>; // file -> export names
  };
  /** The .aid content for this child node */
  content: string;
}

/** Arguments for gen_leaf tool call */
export interface GenLeafArgs {
  /** Name of the leaf (becomes folder name) */
  name: string;
  /** Output path where files go (from path= param, relative to project root) */
  outputPath: string;
  /** Detailed prompt for code generation - must include interface to implement */
  prompt: string;
  /** Files this leaf will create (relative to outputPath) */
  files: string[];
  /** Shell commands to run (must be whitelisted) */
  commands?: string[];
}

// =============================================================================
// Runtime Types
// =============================================================================

/** Runtime execution result for a leaf */
export interface LeafResult {
  leaf: GenLeaf;
  success: boolean;
  filesWritten: string[];
  commandsRun: string[];
  errors: string[];
}

/** Runtime log entry */
export interface LogEntry {
  timestamp: string;
  type: 'command' | 'file_write' | 'llm_call' | 'error';
  leaf?: string;
  details: Record<string, unknown>;
}

// =============================================================================
// Config Types  
// =============================================================================

/** User configuration (from .aidrc or similar) */
export interface AidConfig {
  /** Additional whitelisted commands beyond defaults */
  commandWhitelist?: string[];
  /** Maximum retries for leaf generation */
  maxRetries?: number;
  /** LLM temperature (0 for deterministic) */
  temperature?: number;
}

/** Default whitelisted commands */
export const DEFAULT_COMMAND_WHITELIST = [
  'npm init',
  'npm install',
  'npm ci',
  'bun init',
  'bun install',
  'bun add',
];
