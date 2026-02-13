/**
 * Build phase command
 * Generates code from leaf nodes in .aid-plan/
 */

import { dirname, join } from "node:path";
import type { CLIOptions } from "../../types";
import { getDefaultProvider } from "../../providers";
import { runBuild } from "../../generator";

export async function buildCommand(options: CLIOptions): Promise<number> {
  const projectDir = dirname(options.rootPath);
  const aidPlanDir = join(projectDir, ".aid-plan");
  const buildDir = join(projectDir, "build");

  console.log("Starting build phase...");

  if (options.verbose) {
    console.log(`Source: ${aidPlanDir}`);
    console.log(`Output: ${buildDir}`);
  }

  // Get the default provider based on available API keys
  let provider;
  try {
    provider = getDefaultProvider();
    console.log(`Using provider: ${provider.name}`);
  } catch (err) {
    console.error("Failed to initialize provider:", err);
    console.error("Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY");
    return 1;
  }

  // Run the build
  const result = await runBuild(provider, aidPlanDir, buildDir, {
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
