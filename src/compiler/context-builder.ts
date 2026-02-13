/**
 * Context Builder
 *
 * Builds NodeContext (.aidc content) for child nodes by merging
 * parent context with compile results.
 * 
 * Updated for nginx-like syntax.
 */

import type {
  NodeContext,
  CompileResult,
  RootNode,
} from "../types/index.js";

/**
 * Create the initial root context for a root node.
 *
 * @param rootNode - The root AST node
 * @returns The initial NodeContext for the root
 */
export function createRootContext(rootNode: RootNode): NodeContext {
  return {
    module: "root",
    ancestry: ["root"],
    parameters: {},
    interfaces: {},
    constraints: [],
    suggestions: [],
    utilities: [],
    queryFilters: [],
  };
}

/**
 * Build context for a child node by merging parent context with compile results.
 *
 * @param parentContext - The parent node's context
 * @param compileResult - The compilation result from the provider
 * @param nodeName - The name of the child node
 * @returns A new NodeContext for the child
 */
export function buildChildContext(
  parentContext: NodeContext,
  compileResult: CompileResult,
  nodeName: string
): NodeContext {
  // Build the child's ancestry by appending the node name
  const ancestry = [...parentContext.ancestry, nodeName];

  // Merge interfaces: parent interfaces + new interfaces from compile
  const interfaces: NodeContext["interfaces"] = { ...parentContext.interfaces };
  for (const iface of compileResult.interfaces) {
    interfaces[iface.name] = {
      source: iface.source,
      definition: iface.definition,
    };
  }

  // Merge constraints: parent constraints + new constraints
  const constraints: NodeContext["constraints"] = [
    ...parentContext.constraints,
    ...compileResult.constraints.map((c) => ({
      rule: c.rule,
      source: c.source,
    })),
  ];

  // Merge suggestions: parent suggestions + new suggestions
  const suggestions: NodeContext["suggestions"] = [
    ...parentContext.suggestions,
    ...compileResult.suggestions.map((s) => ({
      rule: s.rule,
      source: s.source,
    })),
  ];

  // Merge utilities: parent utilities + new utilities
  const utilities: NodeContext["utilities"] = [
    ...parentContext.utilities,
    ...compileResult.utilities.map((u) => ({
      name: u.name,
      signature: u.signature,
      location: u.location,
      source: u.source,
    })),
  ];

  // Query filters are inherited from parent (could add local ones in the future)
  const queryFilters = [...parentContext.queryFilters];

  // Parameters are inherited from parent (child can override in its node)
  const parameters = { ...parentContext.parameters };

  return {
    module: nodeName,
    ancestry,
    parameters,
    interfaces,
    constraints,
    suggestions,
    utilities,
    queryFilters,
  };
}

/**
 * Build the node path string from ancestry.
 *
 * @param ancestry - The array of ancestor names
 * @returns A path string like "server/api" or "root"
 */
export function buildNodePath(ancestry: string[]): string {
  // Skip 'root' in the path for cleaner paths
  if (ancestry.length <= 1) {
    return ancestry[0] || "root";
  }
  // Join everything after 'root'
  return ancestry.slice(1).join("/") || "root";
}
