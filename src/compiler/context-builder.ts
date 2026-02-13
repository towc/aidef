/**
 * Context Builder
 *
 * Utility functions for working with ChildContext.
 * 
 * Context flows strictly parent → child. The parent (via AI) explicitly
 * decides what each child receives. The ChildSpec.context field contains
 * this per-child context.
 */

import type { ChildContext } from "../types/index.js";

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
 */
export function buildNodePath(ancestry: string[]): string {
  if (ancestry.length <= 1) {
    return ancestry[0] || "root";
  }
  return ancestry.slice(1).join("/") || "root";
}

/**
 * Merge two contexts.
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
