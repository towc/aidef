/**
 * File Writer
 *
 * Writes .aidg and .aidq files to the .aid-gen/ directory.
 * Uses Bun.file() and Bun.write() for file operations.
 */

import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type { NodeQuestions } from "../types/index.js";

/**
 * Write an .aidg file (spec content).
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
 * Write an .aidq file (questions/considerations).
 */
export async function writeAidqFile(
  outputDir: string,
  nodePath: string,
  questions: NodeQuestions
): Promise<void> {
  const filePath = getAidqPath(outputDir, nodePath);
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, JSON.stringify(questions, null, 2));
}

/**
 * Read an .aidg file.
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
 * Read an .aidq file.
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
  return JSON.parse(content) as NodeQuestions;
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
 * Get the path for an .aidq file.
 */
function getAidqPath(outputDir: string, nodePath: string): string {
  if (nodePath === "root") {
    return join(outputDir, "root.aidq");
  }
  return join(outputDir, nodePath, "node.aidq");
}

// =============================================================================
// Directory Helpers
// =============================================================================

async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}
