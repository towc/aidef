/**
 * Tree View Component
 *
 * Displays the .aid-plan/ directory structure as a tree.
 */

import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { color } from "./terminal.js";
import { readPlanFile, readContextFile, readQuestionsFile } from "../../compiler/writer.js";

/**
 * A node in the tree view
 */
export interface TreeNode {
  /** Display name */
  name: string;
  /** Full node path (e.g., "server/api") */
  nodePath: string;
  /** Whether this is a leaf node (has context file) */
  isLeaf: boolean;
  /** Whether this node has questions */
  hasQuestions: boolean;
  /** Number of unanswered questions */
  questionCount: number;
  /** Child nodes */
  children: TreeNode[];
  /** Whether this node is expanded in the UI */
  expanded: boolean;
  /** Depth in tree (for indentation) */
  depth: number;
}

/**
 * Build tree from .aid-plan/ directory
 */
export async function buildTree(aidPlanDir: string): Promise<TreeNode | null> {
  if (!existsSync(aidPlanDir)) {
    return null;
  }

  // Check for root node
  const rootSpec = await readPlanFile(aidPlanDir, "root");
  if (!rootSpec) {
    return null;
  }

  const rootContext = await readContextFile(aidPlanDir, "root");
  const rootQuestions = await readQuestionsFile(aidPlanDir, "root");

  const root: TreeNode = {
    name: "root",
    nodePath: "root",
    isLeaf: rootContext !== null,
    hasQuestions: rootQuestions !== null && rootQuestions.questions.length > 0,
    questionCount: rootQuestions?.questions.filter(q => !q.answer).length ?? 0,
    children: [],
    expanded: true,
    depth: 0,
  };

  // Scan for child directories
  await scanChildren(aidPlanDir, root, "");

  return root;
}

/**
 * Recursively scan for child nodes
 */
async function scanChildren(
  aidPlanDir: string,
  parent: TreeNode,
  relativePath: string
): Promise<void> {
  const dirPath = relativePath ? join(aidPlanDir, relativePath) : aidPlanDir;

  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip files at the base level (root.plan.aid, etc.)
    const entryPath = join(dirPath, entry);
    const entryStat = await stat(entryPath);

    if (!entryStat.isDirectory()) continue;

    const childPath = relativePath ? join(relativePath, entry) : entry;

    // Check if this directory has a node.plan.aid file
    const specPath = join(entryPath, "node.plan.aid");
    if (!existsSync(specPath)) continue;

    const context = await readContextFile(aidPlanDir, childPath);
    const questions = await readQuestionsFile(aidPlanDir, childPath);

    const child: TreeNode = {
      name: entry,
      nodePath: childPath,
      isLeaf: context !== null,
      hasQuestions: questions !== null && questions.questions.length > 0,
      questionCount: questions?.questions.filter(q => !q.answer).length ?? 0,
      children: [],
      expanded: false,
      depth: parent.depth + 1,
    };

    parent.children.push(child);

    // Recursively scan children
    await scanChildren(aidPlanDir, child, childPath);
  }

  // Sort children alphabetically
  parent.children.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Flatten tree for display (respecting expanded state)
 */
export function flattenTree(root: TreeNode): TreeNode[] {
  const result: TreeNode[] = [];

  function walk(node: TreeNode): void {
    result.push(node);
    if (node.expanded) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(root);
  return result;
}

/**
 * Render a tree node as a string
 */
export function renderTreeNode(
  node: TreeNode,
  selected: boolean,
  showIcons = true
): string {
  const indent = "  ".repeat(node.depth);

  // Icon
  let icon = "";
  if (showIcons) {
    if (node.children.length > 0) {
      icon = node.expanded ? "▼ " : "▶ ";
    } else if (node.isLeaf) {
      icon = "◆ ";
    } else {
      icon = "○ ";
    }
  }

  // Name with styling
  let name = node.name;
  if (node.isLeaf) {
    name = color.green(name);
  } else if (node.children.length > 0) {
    name = color.bold(name);
  }

  // Question indicator
  let suffix = "";
  if (node.questionCount > 0) {
    suffix = " " + color.yellow(`[${node.questionCount}?]`);
  } else if (node.hasQuestions) {
    suffix = " " + color.dim("[?]");
  }

  // Selection highlight
  const line = indent + icon + name + suffix;
  if (selected) {
    return color.inverse(line);
  }
  return line;
}

/**
 * Get total node count in tree
 */
export function countNodes(root: TreeNode): number {
  let count = 1;
  for (const child of root.children) {
    count += countNodes(child);
  }
  return count;
}

/**
 * Get leaf node count in tree
 */
export function countLeaves(root: TreeNode): number {
  let count = root.isLeaf ? 1 : 0;
  for (const child of root.children) {
    count += countLeaves(child);
  }
  return count;
}

/**
 * Get total unanswered question count
 */
export function countQuestions(root: TreeNode): number {
  let count = root.questionCount;
  for (const child of root.children) {
    count += countQuestions(child);
  }
  return count;
}
