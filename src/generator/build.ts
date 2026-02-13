/**
 * Build Orchestrator
 *
 * Orchestrates the build phase: discovers leaf nodes and executes them
 * in parallel to generate code.
 */

import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Provider, GeneratedFile, NodeQuestions } from "../types/index.js";
import { discoverLeafNodes, type LeafNode } from "./discover.js";
import { executeGenerator, type ExecuteResult, type ExecuteOptions } from "./execute.js";

/**
 * Result of the build phase.
 */
export interface BuildResult {
  /** Total number of leaf nodes found */
  totalLeaves: number;
  /** Number of successfully generated nodes */
  successCount: number;
  /** Number of failed nodes */
  failureCount: number;
  /** All generated files */
  files: GeneratedFile[];
  /** All questions raised during generation */
  questions: NodeQuestions["questions"];
  /** All considerations raised during generation */
  considerations: NodeQuestions["considerations"];
  /** All errors encountered */
  errors: string[];
  /** Per-node results */
  results: ExecuteResult[];
}

/**
 * Options for the build phase.
 */
export interface BuildOptions {
  /** Whether to log progress */
  verbose?: boolean;
  /** Whether to add source comment headers */
  addSourceHeaders?: boolean;
  /** Whether to clean the build directory first */
  clean?: boolean;
  /** Maximum parallel executions (default: 5) */
  parallelism?: number;
}

/**
 * Run the build phase.
 *
 * Discovers all leaf nodes in .aid-gen/ and executes them in parallel
 * to generate code in build/.
 *
 * @param provider - The AI provider to use
 * @param aidGenDir - The .aid-gen/ directory
 * @param buildDir - The build/ output directory
 * @param options - Build options
 */
export async function runBuild(
  provider: Provider,
  aidGenDir: string,
  buildDir: string,
  options: BuildOptions = {}
): Promise<BuildResult> {
  const {
    verbose = false,
    addSourceHeaders = true,
    clean = false,
    parallelism = 5,
  } = options;

  // Clean build directory if requested
  if (clean && existsSync(buildDir)) {
    if (verbose) {
      console.log("Cleaning build directory...");
    }
    await rm(buildDir, { recursive: true });
  }

  // Ensure build directory exists
  await mkdir(buildDir, { recursive: true });

  // Discover leaf nodes
  if (verbose) {
    console.log("Discovering leaf nodes...");
  }

  const leaves = await discoverLeafNodes(aidGenDir);

  if (leaves.length === 0) {
    console.log("No leaf nodes found. Run compilation first.");
    return {
      totalLeaves: 0,
      successCount: 0,
      failureCount: 0,
      files: [],
      questions: [],
      considerations: [],
      errors: ["No leaf nodes found in .aid-gen/"],
      results: [],
    };
  }

  if (verbose) {
    console.log(`Found ${leaves.length} leaf node(s)`);
  }

  // Execute generators in parallel with limited concurrency
  const executeOptions: ExecuteOptions = {
    verbose,
    addSourceHeaders,
  };

  const results: ExecuteResult[] = [];

  // Process in batches for controlled parallelism
  for (let i = 0; i < leaves.length; i += parallelism) {
    const batch = leaves.slice(i, i + parallelism);

    if (verbose) {
      console.log(`\nProcessing batch ${Math.floor(i / parallelism) + 1}/${Math.ceil(leaves.length / parallelism)}...`);
    }

    const batchResults = await Promise.all(
      batch.map((leaf) =>
        executeGenerator(leaf.nodePath, provider, aidGenDir, buildDir, executeOptions)
      )
    );

    results.push(...batchResults);
  }

  // Aggregate results
  const allFiles: GeneratedFile[] = [];
  const allQuestions: NodeQuestions["questions"] = [];
  const allConsiderations: NodeQuestions["considerations"] = [];
  const allErrors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const result of results) {
    allFiles.push(...result.files);
    allQuestions.push(...result.questions);
    allConsiderations.push(...result.considerations);
    allErrors.push(...result.errors);

    if (result.success) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  // Print summary
  if (verbose) {
    console.log("\n--- Build Summary ---");
    console.log(`Leaf nodes: ${leaves.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`Files generated: ${allFiles.length}`);

    if (allQuestions.length > 0) {
      console.log(`Questions raised: ${allQuestions.length}`);
    }

    if (allErrors.length > 0) {
      console.log("\nErrors:");
      for (const error of allErrors) {
        console.log(`  - ${error}`);
      }
    }
  }

  return {
    totalLeaves: leaves.length,
    successCount,
    failureCount,
    files: allFiles,
    questions: allQuestions,
    considerations: allConsiderations,
    errors: allErrors,
    results,
  };
}
