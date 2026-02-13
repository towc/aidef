/**
 * Build phase command
 * Generates code from leaf nodes in .aid-gen/
 */

import { dirname, join } from "node:path";
import type { CLIOptions } from "../../types";
import { getProvider } from "../../providers";
import { runBuild } from "../../generator";

export async function buildCommand(options: CLIOptions): Promise<number> {
  const projectDir = dirname(options.rootPath);
  const aidGenDir = join(projectDir, ".aid-gen");
  const buildDir = join(projectDir, "build");

  console.log("Starting build phase...");

  if (options.verbose) {
    console.log(`Source: ${aidGenDir}`);
    console.log(`Output: ${buildDir}`);
  }

  // Get the provider (default to anthropic)
  let provider;
  try {
    provider = getProvider("anthropic");
  } catch (err) {
    console.error("Failed to initialize provider:", err);
    console.error("Set ANTHROPIC_API_KEY environment variable or run 'aid --auth'");
    return 1;
  }

  // Run the build
  const result = await runBuild(provider, aidGenDir, buildDir, {
    verbose: options.verbose,
    addSourceHeaders: true,
    clean: false, // Don't clean by default
    parallelism: 5,
  });

  // Report results
  if (result.totalLeaves === 0) {
    console.log("\nNo leaf nodes found. Run compilation first: aid");
    return 1;
  }

  console.log(`\nBuild complete: ${result.successCount}/${result.totalLeaves} successful`);
  console.log(`Files generated: ${result.files.length}`);

  if (result.questions.length > 0) {
    console.log(`\nQuestions raised: ${result.questions.length}`);
    console.log("Review with: aid --browse");
  }

  if (result.failureCount > 0) {
    console.error(`\n${result.failureCount} node(s) failed to generate.`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    return 1;
  }

  return 0;
}
