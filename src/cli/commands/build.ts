/**
 * Build phase command
 * Generates code from leaf nodes in .aid-gen/
 */

import type { CLIOptions } from "../../types";

export async function buildCommand(options: CLIOptions): Promise<number> {
  console.log("Build not implemented yet");
  
  if (options.verbose) {
    console.log(`Would build from: ${options.rootPath}`);
    console.log("Output directory: ./build/");
  }
  
  // TODO: Implement build phase
  // 1. Find all leaf nodes in .aid-gen/
  // 2. Call provider.generate() for each
  // 3. Write generated files to ./build/
  
  return 0;
}
