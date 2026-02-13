/**
 * TUI browse mode
 * Interactive interface to browse and edit generated specs
 */

import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { CLIOptions } from "../../types";
import { runTui } from "../tui/index.js";

export async function browseCommand(options: CLIOptions): Promise<number> {
  const projectDir = dirname(options.rootPath);
  const aidPlanDir = join(projectDir, ".aid-plan");
  const buildDir = join(projectDir, "build");

  // Check if .aid-plan/ exists
  if (!existsSync(aidPlanDir)) {
    console.log("No .aid-plan/ directory found. Run compilation first: aid");
    return 1;
  }

  if (options.verbose) {
    console.log(`Browsing: ${aidPlanDir}`);
  }

  // Run the TUI
  await runTui(aidPlanDir, buildDir);

  return 0;
}
