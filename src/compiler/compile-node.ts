/**
 * Compile Node
 *
 * Compiles a single AST node using an AI provider to generate
 * child specs, context, and questions.
 */

import type {
  ASTNode,
  ModuleNode,
  RootNode,
  ProseNode,
  NodeContext,
  NodeQuestions,
  Provider,
  ChildSpec,
  CompileResult,
} from "../types/index.js";
import { buildChildContext, buildNodePath } from "./context-builder.js";
import { writeAidgFile, writeAidcFile, writeAidqFile } from "./writer.js";

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
}

/**
 * Compile a single AST node.
 *
 * This function:
 * 1. Converts the AST node to a spec string
 * 2. Calls the provider to compile it
 * 3. Writes the .aidg, .aidc, and .aidq files
 * 4. Returns info about children to compile next
 *
 * @param node - The AST node to compile
 * @param parentContext - Context from the parent node
 * @param provider - The AI provider to use for compilation
 * @param outputDir - The .aid-gen/ directory
 * @returns CompileNodeResult with children and status
 */
export async function compileNode(
  node: ASTNode,
  parentContext: NodeContext,
  provider: Provider,
  outputDir: string
): Promise<CompileNodeResult> {
  const errors: string[] = [];

  // Get node name and tags
  const { name, tags } = getNodeNameAndTags(node);

  // Build the node path from parent context
  const ancestry = [...parentContext.ancestry];
  if (name !== "root" && !ancestry.includes(name)) {
    ancestry.push(name);
  }
  const nodePath = buildNodePath(ancestry);

  // Serialize the node to a spec string
  const spec = serializeNodeToSpec(node);

  // Build context for this node (before compilation)
  const nodeContext: NodeContext = {
    ...parentContext,
    module: name,
    ancestry,
    tags: [...new Set([...parentContext.tags, ...tags])],
  };

  // Write the .aidg file (the spec)
  try {
    await writeAidgFile(outputDir, nodePath, spec);
  } catch (err) {
    errors.push(`Failed to write .aidg file for ${nodePath}: ${err}`);
  }

  // Check if this is already a leaf (no nested module children)
  const hasModuleChildren = hasNestedModules(node);

  if (!hasModuleChildren && isSmallSpec(spec)) {
    // This is a leaf node - no need to call the provider for compilation
    // Write context and return
    try {
      await writeAidcFile(outputDir, nodePath, nodeContext);
    } catch (err) {
      errors.push(`Failed to write .aidc file for ${nodePath}: ${err}`);
    }

    return {
      nodePath,
      isLeaf: true,
      children: [],
      questions: [],
      errors,
    };
  }

  // Call the provider to compile
  let compileResult: CompileResult;
  try {
    compileResult = await provider.compile({
      spec,
      context: nodeContext,
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
    };
  }

  // Determine if this is a leaf node based on compile result
  const isLeaf = compileResult.children.length === 0;

  // Build the final context (with compile result info merged in)
  // For root nodes, we don't want to append the name again since it's already in ancestry
  // For other nodes, buildChildContext will append the name
  const isRootNode = name === "root" && parentContext.module === "root";
  
  let finalContext: NodeContext;
  if (isRootNode) {
    // For root, just merge the compile result without modifying ancestry
    finalContext = {
      ...nodeContext,
      interfaces: {
        ...nodeContext.interfaces,
        ...Object.fromEntries(
          compileResult.interfaces.map((i) => [
            i.name,
            { source: i.source, definition: i.definition },
          ])
        ),
      },
      constraints: [
        ...nodeContext.constraints,
        ...compileResult.constraints.map((c) => ({
          rule: c.rule,
          source: c.source,
          important: c.important,
        })),
      ],
      suggestions: [
        ...nodeContext.suggestions,
        ...compileResult.suggestions.map((s) => ({
          rule: s.rule,
          source: s.source,
        })),
      ],
      utilities: [
        ...nodeContext.utilities,
        ...compileResult.utilities.map((u) => ({
          name: u.name,
          signature: u.signature,
          location: u.location,
          source: u.source,
        })),
      ],
    };
  } else {
    finalContext = buildChildContext(
      parentContext,
      compileResult,
      name,
      tags
    );
  }

  // Write the .aidc file (context)
  try {
    await writeAidcFile(outputDir, nodePath, finalContext);
  } catch (err) {
    errors.push(`Failed to write .aidc file for ${nodePath}: ${err}`);
  }

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

  return {
    nodePath,
    isLeaf,
    children: compileResult.children,
    questions: compileResult.questions,
    errors,
  };
}

/**
 * Compile a root node (entry point for compilation).
 *
 * @param rootNode - The root AST node
 * @param rootContext - The root context
 * @param provider - The AI provider
 * @param outputDir - The .aid-gen/ directory
 * @returns CompileNodeResult
 */
export async function compileRootNode(
  rootNode: RootNode,
  rootContext: NodeContext,
  provider: Provider,
  outputDir: string
): Promise<CompileNodeResult> {
  return compileNode(rootNode, rootContext, provider, outputDir);
}

// =============================================================================
// Node Serialization
// =============================================================================

/**
 * Serialize an AST node back to CSS-like spec format.
 */
function serializeNodeToSpec(node: ASTNode): string {
  switch (node.type) {
    case "root":
      return serializeRootNode(node);
    case "module":
      return serializeModuleNode(node);
    case "prose":
      return serializeProseNode(node);
    case "tag_block":
      return serializeTagBlockNode(node);
    case "universal_block":
      return serializeUniversalBlockNode(node);
    case "pseudo_block":
      return serializePseudoBlockNode(node);
    case "import":
      return `@${node.path}`;
    case "constraint":
      return node.content + (node.important ? " !important" : "");
    default:
      return "";
  }
}

function serializeRootNode(node: RootNode): string {
  return node.children.map(serializeNodeToSpec).join("\n\n");
}

function serializeModuleNode(node: ModuleNode): string {
  // Build selector
  let selector = node.name;

  // Add tags
  if (node.tags.length > 0) {
    selector += node.tags.map((t) => `.${t}`).join("");
  }

  // Add pseudos
  for (const pseudo of node.pseudos) {
    selector += `:${pseudo.name}`;
    if (pseudo.args && pseudo.args.length > 0) {
      selector += `(${pseudo.args.join(", ")})`;
    }
  }

  // Add combinator prefix for nested selectors
  if (node.combinator) {
    switch (node.combinator) {
      case "child":
        selector = "> " + selector;
        break;
      case "adjacent":
        selector = "+ " + selector;
        break;
      case "general":
        selector = "~ " + selector;
        break;
      // 'descendant' is implicit (no prefix needed)
    }
  }

  // Build body
  const body = node.children.map(serializeNodeToSpec).filter(Boolean).join("\n");
  const indentedBody = body
    .split("\n")
    .map((line) => (line.trim() ? "  " + line : line))
    .join("\n");

  return `${selector} {\n${indentedBody}\n}`;
}

function serializeProseNode(node: ProseNode): string {
  let content = node.content;
  if (node.important) {
    content += " !important";
  }
  return content;
}

function serializeTagBlockNode(
  node: ASTNode & { type: "tag_block"; tags: string[]; children: ASTNode[] }
): string {
  const selector = node.tags.map((t) => `.${t}`).join("");
  const body = node.children.map(serializeNodeToSpec).filter(Boolean).join("\n");
  const indentedBody = body
    .split("\n")
    .map((line) => (line.trim() ? "  " + line : line))
    .join("\n");
  return `${selector} {\n${indentedBody}\n}`;
}

function serializeUniversalBlockNode(
  node: ASTNode & { type: "universal_block"; children: ASTNode[] }
): string {
  const body = node.children.map(serializeNodeToSpec).filter(Boolean).join("\n");
  const indentedBody = body
    .split("\n")
    .map((line) => (line.trim() ? "  " + line : line))
    .join("\n");
  return `* {\n${indentedBody}\n}`;
}

function serializePseudoBlockNode(
  node: ASTNode & {
    type: "pseudo_block";
    pseudo: { name: string; args?: string[] };
    children: ASTNode[];
  }
): string {
  let selector = `:${node.pseudo.name}`;
  if (node.pseudo.args && node.pseudo.args.length > 0) {
    selector += `(${node.pseudo.args.join(", ")})`;
  }
  const body = node.children.map(serializeNodeToSpec).filter(Boolean).join("\n");
  const indentedBody = body
    .split("\n")
    .map((line) => (line.trim() ? "  " + line : line))
    .join("\n");
  return `${selector} {\n${indentedBody}\n}`;
}

// =============================================================================
// Node Analysis Helpers
// =============================================================================

/**
 * Extract name and tags from a node.
 */
function getNodeNameAndTags(node: ASTNode): { name: string; tags: string[] } {
  switch (node.type) {
    case "root":
      return { name: "root", tags: [] };
    case "module":
      return { name: node.name, tags: node.tags };
    case "tag_block":
      return { name: node.tags.join("-"), tags: node.tags };
    case "universal_block":
      return { name: "universal", tags: [] };
    case "pseudo_block":
      return { name: node.pseudo.name, tags: [] };
    default:
      return { name: "unknown", tags: [] };
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
    (child) =>
      child.type === "module" ||
      child.type === "tag_block" ||
      child.type === "universal_block" ||
      child.type === "pseudo_block"
  );
}

/**
 * Check if a spec is small enough to be a leaf without AI analysis.
 */
function isSmallSpec(spec: string): boolean {
  // Consider specs under 100 chars without nested braces as potentially leaf nodes
  return spec.length < 100 && !spec.includes("{");
}
