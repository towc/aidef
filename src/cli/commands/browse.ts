/**
 * TUI browse mode
 * Interactive interface to browse and edit generated specs
 */

import type { CLIOptions } from "../../types";

export async function browseCommand(options: CLIOptions): Promise<number> {
  console.log("TUI not implemented yet");
  
  if (options.verbose) {
    console.log(`Would browse specs at: ${options.rootPath}`);
  }
  
  // TODO: Implement TUI
  // 1. Load .aid-gen/ tree
  // 2. Display tree view
  // 3. Allow navigation and editing
  // 4. Handle questions/considerations
  
  return 0;
}
