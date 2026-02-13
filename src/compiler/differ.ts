/**
 * Differ
 *
 * Compares compiled nodes to detect changes and enable incremental builds.
 * Uses content hashing to determine if a node needs recompilation.
 */

import { createHash } from "node:crypto";
import type { ChildContext, ASTNode, ModuleNode, CacheMetadata } from "../types/index.js";
import { readAidgFile } from "./writer.js";
import { readSourceMap } from "./source-map.js";

/**
 * Result of comparing a node's current state to its cached state.
 */
export interface DiffResult {
  /** Whether the node needs recompilation */
  needsRecompile: boolean;
  /** Reason for the decision */
  reason: string;
  /** Hash of the current spec (for caching) */
  specHash: string;
  /** Hash of the parent context (for caching) */
  contextHash: string;
}

// CacheMetadata is imported from types/index.ts
// Re-export for consumers
export type { CacheMetadata } from "../types/index.js";

/**
 * Compare a node's current state to its cached state.
 *
 * @param nodePath - The node path (e.g., "server/api")
 * @param currentSpec - The current spec content
 * @param parentContext - The current parent context
 * @param outputDir - The .aid-gen/ directory
 * @returns DiffResult indicating whether recompilation is needed
 */
export async function diffNode(
  nodePath: string,
  currentSpec: string,
  parentContext: ChildContext,
  outputDir: string
): Promise<DiffResult> {
  const specHash = hashContent(currentSpec);
  const contextHash = hashContext(parentContext);

  // Try to read existing cached files
  const [existingSpec, sourceMap] = await Promise.all([
    readAidgFile(outputDir, nodePath),
    readSourceMap(outputDir, nodePath),
  ]);

  // No cached files - needs compilation
  if (!existingSpec || !sourceMap) {
    return {
      needsRecompile: true,
      reason: "No cached compilation found",
      specHash,
      contextHash,
    };
  }

  // Check if spec has changed
  const existingSpecHash = hashContent(existingSpec);
  if (specHash !== existingSpecHash) {
    return {
      needsRecompile: true,
      reason: "Spec content has changed",
      specHash,
      contextHash,
    };
  }

  // Check if cache metadata exists in source map
  const cacheMetadata = sourceMap.cache;
  if (!cacheMetadata) {
    return {
      needsRecompile: true,
      reason: "No cache metadata in source map",
      specHash,
      contextHash,
    };
  }

  // Check if parent context has changed
  if (cacheMetadata.parentContextHash !== contextHash) {
    return {
      needsRecompile: true,
      reason: "Parent context has changed",
      specHash,
      contextHash,
    };
  }

  // Everything matches - no recompilation needed
  return {
    needsRecompile: false,
    reason: "Cached compilation is valid",
    specHash,
    contextHash,
  };
}

/**
 * Create cache metadata for storing in source maps.
 *
 * @param specHash - Hash of the spec that produced this output
 * @param parentContextHash - Hash of the parent context used
 * @returns CacheMetadata to be stored in source map
 */
export function createCacheMetadata(
  specHash: string,
  parentContextHash: string
): CacheMetadata {
  return {
    specHash,
    parentContextHash,
    compiledAt: new Date().toISOString(),
  };
}

/**
 * Hash a string content using SHA-256.
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Hash a ChildContext for comparison.
 * Hashes all fields that affect child compilation.
 */
export function hashContext(context: ChildContext): string {
  // Create a deterministic representation of the context
  const relevantData = {
    // Interfaces that children might reference
    interfaces: sortObject(context.interfaces),
    // Constraints that children must follow
    constraints: context.constraints.map((c) => c.rule).sort(),
    // Utilities available to children
    utilities: context.utilities.map((u) => `${u.name}:${u.signature}`).sort(),
    // Forwarding instructions
    forwarding: context.forwarding,
  };

  const json = JSON.stringify(relevantData);
  return hashContent(json);
}

/**
 * Sort an object's keys for deterministic JSON serialization.
 */
function sortObject<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted as T;
}

/**
 * Check if an AST node has structural changes compared to its cached version.
 * This is a quick check before doing full diff.
 */
export function hasStructuralChanges(
  node: ASTNode,
  cachedContext: ChildContext | null
): boolean {
  if (!cachedContext) {
    return true; // No cache, assume changes
  }

  // For module nodes, check if the child structure has changed
  if (node.type === "module") {
    const moduleNode = node as ModuleNode;
    const childModules = moduleNode.children.filter(
      (c) => c.type === "module" || c.type === "query_filter"
    );

    // TODO: Compare child structure with cached children
    // For now, return false (no structural changes detected)
    // This is conservative - we'll still do content diffing
  }

  return false;
}

/**
 * Generate a summary of what changed between old and new context.
 */
export function summarizeChanges(
  oldContext: ChildContext | null,
  newContext: ChildContext
): string[] {
  const changes: string[] = [];

  if (!oldContext) {
    changes.push("New node (no previous compilation)");
    return changes;
  }

  // Check interfaces
  const oldInterfaces = new Set(Object.keys(oldContext.interfaces));
  const newInterfaces = new Set(Object.keys(newContext.interfaces));

  for (const iface of newInterfaces) {
    if (!oldInterfaces.has(iface)) {
      changes.push(`Added interface: ${iface}`);
    }
  }
  for (const iface of oldInterfaces) {
    if (!newInterfaces.has(iface)) {
      changes.push(`Removed interface: ${iface}`);
    }
  }

  // Check constraints
  const oldConstraints = new Set(oldContext.constraints.map((c) => c.rule));
  const newConstraints = new Set(newContext.constraints.map((c) => c.rule));

  for (const rule of newConstraints) {
    if (!oldConstraints.has(rule)) {
      changes.push(`Added constraint: ${rule.slice(0, 50)}...`);
    }
  }
  for (const rule of oldConstraints) {
    if (!newConstraints.has(rule)) {
      changes.push(`Removed constraint: ${rule.slice(0, 50)}...`);
    }
  }

  // Check utilities
  const oldUtilities = new Set(oldContext.utilities.map((u) => u.name));
  const newUtilities = new Set(newContext.utilities.map((u) => u.name));

  for (const util of newUtilities) {
    if (!oldUtilities.has(util)) {
      changes.push(`Added utility: ${util}`);
    }
  }
  for (const util of oldUtilities) {
    if (!newUtilities.has(util)) {
      changes.push(`Removed utility: ${util}`);
    }
  }

  if (changes.length === 0) {
    changes.push("Minor changes (no interface/constraint/utility changes)");
  }

  return changes;
}
