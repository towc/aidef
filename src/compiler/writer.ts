/**
 * File Writer
 *
 * Writes .plan.aid and .plan.aid.questions.json files to the .aid-gen/ directory.
 * Uses Bun.file() and Bun.write() for file operations.
 */

import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type { NodeQuestions } from "../types/index.js";

/**
 * Write a .plan.aid file (spec content).
 */
export async function writePlanFile(
  outputDir: string,
  nodePath: string,
  spec: string
): Promise<void> {
  const filePath = getPlanPath(outputDir, nodePath);
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, spec);
}

/**
 * Write a .plan.aid.questions.json file (questions/considerations).
 */
export async function writeQuestionsFile(
  outputDir: string,
  nodePath: string,
  questions: NodeQuestions
): Promise<void> {
  const filePath = getQuestionsPath(outputDir, nodePath);
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, JSON.stringify(questions, null, 2));
}

/**
 * Read a .plan.aid file.
 */
export async function readPlanFile(
  outputDir: string,
  nodePath: string
): Promise<string | null> {
  const filePath = getPlanPath(outputDir, nodePath);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return null;
  }

  return file.text();
}

/**
 * Read a .plan.aid.questions.json file.
 */
export async function readQuestionsFile(
  outputDir: string,
  nodePath: string
): Promise<NodeQuestions | null> {
  const filePath = getQuestionsPath(outputDir, nodePath);
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
 * Get the path for a .plan.aid file.
 *
 * File structure:
 * - root node: .aid-gen/root.plan.aid
 * - nested nodes: .aid-gen/server/node.plan.aid, .aid-gen/server/api/node.plan.aid
 */
function getPlanPath(outputDir: string, nodePath: string): string {
  if (nodePath === "root") {
    return join(outputDir, "root.plan.aid");
  }
  return join(outputDir, nodePath, "node.plan.aid");
}

/**
 * Get the path for a .plan.aid.questions.json file.
 */
function getQuestionsPath(outputDir: string, nodePath: string): string {
  if (nodePath === "root") {
    return join(outputDir, "root.plan.aid.questions.json");
  }
  return join(outputDir, nodePath, "node.plan.aid.questions.json");
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
