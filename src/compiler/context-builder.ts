/**
 * Context Builder
 *
 * Utility functions for working with ChildContext.
 * 
 * In the new model, context is NOT accumulated from all ancestors.
 * Instead, the parent (via AI) explicitly decides what each child receives.
 * The ChildSpec.context field contains this per-child context.
 */

import type {
  ChildContext,
  RootNode,
  EMPTY_CONTEXT,
} from "../types/index.js";

/**
 * Create the initial empty context for the root node.
 * Root has no parent, so it receives empty context.
 */
export function createRootContext(): ChildContext {
  return {
    interfaces: {},
    constraints: [],
    utilities: [],
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

/**
 * Merge two contexts (used when combining parent context with local declarations).
 * Note: In the new model, this is rarely needed since parent passes complete context.
 */
export function mergeContexts(base: ChildContext, additions: Partial<ChildContext>): ChildContext {
  return {
    interfaces: {
      ...base.interfaces,
      ...(additions.interfaces || {}),
    },
    constraints: [
      ...base.constraints,
      ...(additions.constraints || []),
    ],
    utilities: [
      ...base.utilities,
      ...(additions.utilities || []),
    ],
    forwarding: additions.forwarding || base.forwarding,
  };
}

/**
 * Check if a context is empty.
 */
export function isEmptyContext(context: ChildContext): boolean {
  return (
    Object.keys(context.interfaces).length === 0 &&
    context.constraints.length === 0 &&
    context.utilities.length === 0
  );
}

/**
 * Serialize context to a human-readable string (for debugging/logging).
 */
export function formatContext(context: ChildContext): string {
  const parts: string[] = [];
  
  const interfaceCount = Object.keys(context.interfaces).length;
  if (interfaceCount > 0) {
    parts.push(`${interfaceCount} interface(s): ${Object.keys(context.interfaces).join(', ')}`);
  }
  
  if (context.constraints.length > 0) {
    parts.push(`${context.constraints.length} constraint(s)`);
  }
  
  if (context.utilities.length > 0) {
    const utilNames = context.utilities.map(u => u.name).join(', ');
    parts.push(`${context.utilities.length} utility(s): ${utilNames}`);
  }
  
  if (context.forwarding?.utilities?.length) {
    parts.push(`forwarding: ${context.forwarding.utilities.join(', ')}`);
  }
  
  return parts.length > 0 ? parts.join('; ') : '(empty context)';
}

// =============================================================================
// Legacy support (for gradual migration)
// =============================================================================

import type { NodeContext, CompileResult } from "../types/index.js";

/**
 * @deprecated Use ChildContext and ChildSpec.context instead.
 * This function exists for backward compatibility during migration.
 */
export function createLegacyRootContext(rootNode: RootNode): NodeContext {
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
 * @deprecated Use ChildSpec.context instead.
 * This function exists for backward compatibility during migration.
 */
export function buildChildContext(
  parentContext: NodeContext,
  compileResult: CompileResult,
  nodeName: string
): NodeContext {
  const ancestry = [...parentContext.ancestry, nodeName];

  const interfaces: NodeContext["interfaces"] = { ...parentContext.interfaces };
  for (const iface of compileResult.interfaces) {
    interfaces[iface.name] = {
      source: iface.source,
      definition: iface.definition,
    };
  }

  const constraints: NodeContext["constraints"] = [
    ...parentContext.constraints,
    ...compileResult.constraints.map((c) => ({
      rule: c.rule,
      source: c.source,
    })),
  ];

  const suggestions: NodeContext["suggestions"] = [
    ...parentContext.suggestions,
  ];

  const utilities: NodeContext["utilities"] = [
    ...parentContext.utilities,
    ...compileResult.utilities.map((u) => ({
      name: u.name,
      signature: u.signature,
      location: u.location,
      source: u.source,
    })),
  ];

  const queryFilters = [...parentContext.queryFilters];
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
