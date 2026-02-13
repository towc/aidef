/**
 * Leaf Node Discovery
 *
 * Finds all leaf nodes (generators) in the .aid-gen/ directory.
 * Leaf nodes are identified by having a .plan.aid.context.json file
 * (only leaf nodes have context files).
 */

import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";

/**
 * Information about a discovered leaf node.
 */
export interface LeafNode {
  /** Node path (e.g., "server/api/users") */
  nodePath: string;
  /** Full path to the .plan.aid file */
  specPath: string;
  /** Full path to the .plan.aid.context.json file */
  contextPath: string;
}

/**
 * Discover all leaf nodes in the .aid-gen/ directory.
 *
 * Leaf nodes are identified by the presence of a .plan.aid.context.json file.
 *
 * @param aidGenDir - The .aid-gen/ directory to scan
 * @returns Array of discovered leaf nodes
 */
export async function discoverLeafNodes(aidGenDir: string): Promise<LeafNode[]> {
  const leaves: LeafNode[] = [];

  // Check root node
  const rootContextPath = join(aidGenDir, "root.plan.aid.context.json");
  if (await fileExists(rootContextPath)) {
    leaves.push({
      nodePath: "root",
      specPath: join(aidGenDir, "root.plan.aid"),
      contextPath: rootContextPath,
    });
  }

  // Recursively scan directories
  await scanDirectory(aidGenDir, "", leaves);

  return leaves;
}

/**
 * Recursively scan a directory for leaf nodes.
 */
async function scanDirectory(
  baseDir: string,
  relativePath: string,
  leaves: LeafNode[]
): Promise<void> {
  const dirPath = relativePath ? join(baseDir, relativePath) : baseDir;

  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    return; // Directory doesn't exist or isn't readable
  }

  for (const entry of entries) {
    const entryPath = join(dirPath, entry);
    const entryStat = await stat(entryPath);

    if (entryStat.isDirectory()) {
      // Check if this directory contains a leaf node
      const nodePath = relativePath ? join(relativePath, entry) : entry;
      const contextPath = join(entryPath, "node.plan.aid.context.json");

      if (await fileExists(contextPath)) {
        leaves.push({
          nodePath,
          specPath: join(entryPath, "node.plan.aid"),
          contextPath,
        });
      }

      // Continue scanning subdirectories
      await scanDirectory(baseDir, nodePath, leaves);
    }
  }
}

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    const file = Bun.file(path);
    return await file.exists();
  } catch {
    return false;
  }
}
