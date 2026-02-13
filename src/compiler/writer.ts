/**
 * File Writer
 *
 * Writes .aidg and .aidq files to the .aid-gen/ directory.
 * Uses Bun.file() and Bun.write() for file operations.
 *
 * Note: .aidc file operations are deprecated. Context is now passed in-memory
 * from parent to child nodes during compilation instead of being stored in files.
 */

import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type { NodeContext, NodeQuestions } from "../types/index.js";

/**
 * Write an .aidg file (CSS-like spec format).
 *
 * @param outputDir - The .aid-gen/ directory
 * @param nodePath - The node path (e.g., "server/api")
 * @param spec - The spec content to write
 */
export async function writeAidgFile(
  outputDir: string,
  nodePath: string,
  spec: string
): Promise<void> {
  const filePath = getAidgPath(outputDir, nodePath);
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, spec);
}

/**
 * Write an .aidc file (YAML/JSON context format).
 *
 * @deprecated Context is now passed in-memory from parent to child nodes.
 * This function exists for backward compatibility only and will be removed
 * in a future version. Do not use in new code.
 *
 * @param outputDir - The .aid-gen/ directory
 * @param nodePath - The node path (e.g., "server/api")
 * @param context - The NodeContext to write
 */
export async function writeAidcFile(
  outputDir: string,
  nodePath: string,
  context: NodeContext
): Promise<void> {
  const filePath = getAidcPath(outputDir, nodePath);
  await ensureDir(dirname(filePath));

  // For now, use JSON (could switch to YAML with a library later)
  const content = serializeContext(context);
  await Bun.write(filePath, content);
}

/**
 * Write an .aidq file (YAML/JSON questions format).
 *
 * @param outputDir - The .aid-gen/ directory
 * @param nodePath - The node path (e.g., "server/api")
 * @param questions - The NodeQuestions to write
 */
export async function writeAidqFile(
  outputDir: string,
  nodePath: string,
  questions: NodeQuestions
): Promise<void> {
  const filePath = getAidqPath(outputDir, nodePath);
  await ensureDir(dirname(filePath));

  // For now, use JSON (could switch to YAML with a library later)
  const content = serializeQuestions(questions);
  await Bun.write(filePath, content);
}

/**
 * Read an .aidc file and parse it back to NodeContext.
 *
 * @deprecated Context is now passed in-memory from parent to child nodes.
 * This function exists for backward compatibility only and will be removed
 * in a future version. Do not use in new code.
 *
 * @param outputDir - The .aid-gen/ directory
 * @param nodePath - The node path (e.g., "server/api")
 * @returns The parsed NodeContext or null if file doesn't exist
 */
export async function readAidcFile(
  outputDir: string,
  nodePath: string
): Promise<NodeContext | null> {
  const filePath = getAidcPath(outputDir, nodePath);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  return deserializeContext(content);
}

/**
 * Read an .aidg file.
 *
 * @param outputDir - The .aid-gen/ directory
 * @param nodePath - The node path (e.g., "server/api")
 * @returns The spec content or null if file doesn't exist
 */
export async function readAidgFile(
  outputDir: string,
  nodePath: string
): Promise<string | null> {
  const filePath = getAidgPath(outputDir, nodePath);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return null;
  }

  return file.text();
}

/**
 * Read an .aidq file and parse it back to NodeQuestions.
 *
 * @param outputDir - The .aid-gen/ directory
 * @param nodePath - The node path (e.g., "server/api")
 * @returns The parsed NodeQuestions or null if file doesn't exist
 */
export async function readAidqFile(
  outputDir: string,
  nodePath: string
): Promise<NodeQuestions | null> {
  const filePath = getAidqPath(outputDir, nodePath);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  return deserializeQuestions(content);
}

// =============================================================================
// Path Helpers
// =============================================================================

/**
 * Get the path for an .aidg file.
 *
 * File structure:
 * - root node: .aid-gen/root.aidg
 * - nested nodes: .aid-gen/server/node.aidg, .aid-gen/server/api/node.aidg
 */
function getAidgPath(outputDir: string, nodePath: string): string {
  if (nodePath === "root") {
    return join(outputDir, "root.aidg");
  }
  return join(outputDir, nodePath, "node.aidg");
}

/**
 * Get the path for an .aidc file.
 * @deprecated Used only by deprecated aidc functions.
 */
function getAidcPath(outputDir: string, nodePath: string): string {
  if (nodePath === "root") {
    return join(outputDir, "root.aidc");
  }
  return join(outputDir, nodePath, "node.aidc");
}

/**
 * Get the path for an .aidq file.
 */
function getAidqPath(outputDir: string, nodePath: string): string {
  if (nodePath === "root") {
    return join(outputDir, "root.aidq");
  }
  return join(outputDir, nodePath, "node.aidq");
}

// =============================================================================
// Serialization Helpers
// =============================================================================

/**
 * Serialize NodeContext to JSON (could use YAML in the future).
 * @deprecated Used only by deprecated aidc functions.
 */
function serializeContext(context: NodeContext): string {
  return JSON.stringify(context, null, 2);
}

/**
 * Deserialize JSON to NodeContext.
 * @deprecated Used only by deprecated aidc functions.
 */
function deserializeContext(content: string): NodeContext {
  return JSON.parse(content) as NodeContext;
}

/**
 * Serialize NodeQuestions to JSON (could use YAML in the future).
 */
function serializeQuestions(questions: NodeQuestions): string {
  return JSON.stringify(questions, null, 2);
}

/**
 * Deserialize JSON to NodeQuestions.
 */
function deserializeQuestions(content: string): NodeQuestions {
  return JSON.parse(content) as NodeQuestions;
}

// =============================================================================
// Directory Helpers
// =============================================================================

/**
 * Ensure a directory exists, creating it if necessary.
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err: unknown) {
    // Ignore EEXIST errors
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}
