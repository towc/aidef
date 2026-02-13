/**
 * Compile Node
 *
 * Compiles a single AST node using an AI provider to generate
 * child specs, context, and questions.
 * 
 * Updated for nginx-like syntax.
 */

import type {
  ASTNode,
  ModuleNode,
  RootNode,
  ProseNode,
  QueryFilterNode,
  ParameterNode,
  IncludeNode,
  ChildContext,
  NodeQuestions,
  Provider,
  ChildSpec,
  CompileResult,
} from "../types/index.js";
import { createRootContext } from "./context-builder.js";
import { writeAidgFile, writeAidqFile } from "./writer.js";

/**
 * Result of compiling a single node.
 */
export interface CompileNodeResult {
  /** The path of this node (e.g., "server/api") */
  nodePath: string;
  /** Whether this is a leaf node (no children) */
  isLeaf: boolean;
  /** Child specs to compile next */
  children: ChildSpec[];
  /** Questions raised during compilation */
  questions: NodeQuestions["questions"];
  /** Errors encountered during compilation */
  errors: string[];
  /** Whether this node was skipped due to caching */
  skipped: boolean;
  /** Reason for skip/recompile decision */
  cacheStatus?: string;
}

/**
 * Options for node compilation.
 */
export interface CompileOptions {
  /** Whether to use caching (skip unchanged nodes) */
  useCache?: boolean;
  /** Whether to log cache decisions */
  verbose?: boolean;
}

/**
 * Compile a single AST node.
 *
 * This function:
 * 1. Converts the AST node to a spec string
 * 2. Calls the provider to compile it
 * 3. Writes the .aidg and .aidq files (context is in-memory via ChildSpec.context)
 * 4. Returns info about children to compile next
 *
 * In the new model, context flows parent→child. The AI decides what each child
 * receives, and that context is in CompileResult.children[].context.
 *
 * @param node - The AST node to compile
 * @param context - Context passed from parent (what this node can use)
 * @param provider - The AI provider to use for compilation
 * @param outputDir - The .aid-gen/ directory
 * @param options - Compilation options (caching, verbosity)
 * @returns CompileNodeResult with children and status
 */
export async function compileNode(
  node: ASTNode,
  context: ChildContext,
  provider: Provider,
  outputDir: string,
  options: CompileOptions = {}
): Promise<CompileNodeResult> {
  const { verbose = false } = options;
  const errors: string[] = [];

  // Get node name and parameters
  const { name, parameters } = getNodeNameAndParams(node);

  // Build the node path (simplified - just use node name for now)
  const nodePath = name === "root" ? "root" : name;

  // Serialize the node to a spec string
  const spec = serializeNodeToSpec(node);

  // Write the .aidg file (the spec)
  try {
    await writeAidgFile(outputDir, nodePath, spec);
  } catch (err) {
    errors.push(`Failed to write .aidg file for ${nodePath}: ${err}`);
  }

  // Check if this is explicitly marked as a leaf
  const isExplicitLeaf = parameters.leaf !== undefined;

  // Check if this is already a leaf (no nested module children)
  const hasModuleChildren = hasNestedModules(node);

  if ((isExplicitLeaf || !hasModuleChildren) && isSmallSpec(spec)) {
    // This is a leaf node - no need to call the provider for compilation
    if (verbose) {
      console.log(`  [leaf] ${nodePath}: Small spec with no children`);
    }

    return {
      nodePath,
      isLeaf: true,
      children: [],
      questions: [],
      errors,
      skipped: false,
      cacheStatus: "Leaf node (no compilation needed)",
    };
  }

  // Call the provider to compile
  // The provider receives the context passed from parent
  let compileResult: CompileResult;
  try {
    compileResult = await provider.compile({
      spec,
      context,
      nodePath,
    });
  } catch (err) {
    errors.push(`Provider compilation failed for ${nodePath}: ${err}`);
    return {
      nodePath,
      isLeaf: true, // Treat as leaf on error
      children: [],
      questions: [],
      errors,
      skipped: false,
      cacheStatus: "Compilation failed",
    };
  }

  // Determine if this is a leaf node based on compile result
  const isLeaf = compileResult.children.length === 0;

  // Write .aidq file if there are questions or considerations
  if (
    compileResult.questions.length > 0 ||
    compileResult.considerations.length > 0
  ) {
    const questions: NodeQuestions = {
      module: name,
      questions: compileResult.questions,
      considerations: compileResult.considerations,
    };

    try {
      await writeAidqFile(outputDir, nodePath, questions);
    } catch (err) {
      errors.push(`Failed to write .aidq file for ${nodePath}: ${err}`);
    }
  }

  // Children already have their context set by the AI in compileResult.children[].context
  // No need to build context here - just pass them through
  return {
    nodePath,
    isLeaf,
    children: compileResult.children,
    questions: compileResult.questions,
    errors,
    skipped: false,
    cacheStatus: "Compiled successfully",
  };
}

/**
 * Compile a root node (entry point for compilation).
 *
 * @param rootNode - The root AST node
 * @param provider - The AI provider
 * @param outputDir - The .aid-gen/ directory
 * @param options - Compilation options
 * @returns CompileNodeResult
 */
export async function compileRootNode(
  rootNode: RootNode,
  provider: Provider,
  outputDir: string,
  options?: CompileOptions
): Promise<CompileNodeResult> {
  // Root receives empty context (no parent)
  const rootContext = createRootContext();
  return compileNode(rootNode, rootContext, provider, outputDir, options);
}

// =============================================================================
// Node Serialization (nginx-like syntax)
// =============================================================================

/**
 * Serialize an AST node back to nginx-like spec format.
 */
function serializeNodeToSpec(node: ASTNode): string {
  switch (node.type) {
    case "root":
      return serializeRootNode(node);
    case "module":
      return serializeModuleNode(node);
    case "query_filter":
      return serializeQueryFilterNode(node);
    case "prose":
      return serializeProseNode(node);
    case "parameter":
      return serializeParameterNode(node);
    case "include":
      return `include ${node.path};`;
    default:
      return "";
  }
}

function serializeRootNode(node: RootNode): string {
  return node.children.map(serializeNodeToSpec).join("\n\n");
}

function serializeModuleNode(node: ModuleNode): string {
  const parts: string[] = [];
  
  // Add parameters inside the block
  for (const param of node.parameters) {
    parts.push(`  ${param.name}=${formatParamValue(param.value)};`);
  }
  
  // Add children
  for (const child of node.children) {
    const serialized = serializeNodeToSpec(child);
    if (serialized) {
      // Indent each line
      const indented = serialized
        .split("\n")
        .map((line) => (line.trim() ? "  " + line : line))
        .join("\n");
      parts.push(indented);
    }
  }
  
  const body = parts.join("\n");
  return `${node.name} {\n${body}\n}`;
}

function serializeQueryFilterNode(node: QueryFilterNode): string {
  const body = node.children.map(serializeNodeToSpec).filter(Boolean).join("\n");
  const indentedBody = body
    .split("\n")
    .map((line) => (line.trim() ? "  " + line : line))
    .join("\n");
  return `"${escapeString(node.question)}" {\n${indentedBody}\n}`;
}

function serializeProseNode(node: ProseNode): string {
  return node.content;
}

function serializeParameterNode(node: ParameterNode): string {
  return `${node.name}=${formatParamValue(node.value)};`;
}

function formatParamValue(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }
  return `"${escapeString(value)}"`;
}

function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// =============================================================================
// Node Analysis Helpers
// =============================================================================

/**
 * Extract name and parameters from a node.
 */
function getNodeNameAndParams(node: ASTNode): {
  name: string;
  parameters: Record<string, string | number>;
} {
  switch (node.type) {
    case "root":
      return { name: "root", parameters: {} };
    case "module":
      return {
        name: node.name,
        parameters: Object.fromEntries(
          node.parameters.map((p) => [p.name, p.value])
        ),
      };
    case "query_filter":
      return { name: "query_filter", parameters: {} };
    default:
      return { name: "unknown", parameters: {} };
  }
}

/**
 * Check if a node has nested module children.
 */
function hasNestedModules(node: ASTNode): boolean {
  if (!("children" in node)) {
    return false;
  }

  const children = (node as { children: ASTNode[] }).children;
  return children.some(
    (child) => child.type === "module" || child.type === "query_filter"
  );
}

/**
 * Check if a spec is small enough to be a leaf without AI analysis.
 */
function isSmallSpec(spec: string): boolean {
  // Consider specs under 100 chars without nested braces as potentially leaf nodes
  return spec.length < 100 && !spec.includes("{");
}
