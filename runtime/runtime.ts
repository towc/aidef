import * as fs from 'fs/promises';
import * as path from 'path';
import { executeLeaf, LeafExecutionResult } from './leafExecutor';

async function findLeafFiles(dir: string): Promise<string[]> {
  let leafFiles: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      leafFiles = leafFiles.concat(await findLeafFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.gen.aid.leaf.json')) {
      leafFiles.push(fullPath);
    }
  }
  return leafFiles;
}

export async function runAidefRuntime(): Promise<void> {
  console.log("\n--- Starting aidef Runtime ---");
  const projectRoot = process.cwd();
  console.log(`Scanning for leaf files in: ${projectRoot}`);

  try {
    const leafFiles = await findLeafFiles(projectRoot);

    if (leafFiles.length === 0) {
      console.log("No .gen.aid.leaf.json files found. Exiting.");
      return;
    }

    console.log(`Found ${leafFiles.length} leaf(s) to execute.`);
    leafFiles.forEach(file => console.log(`  - ${file}`));

    const executionPromises = leafFiles.map(leafPath => executeLeaf(leafPath));
    const results = await Promise.allSettled(executionPromises);

    console.log("\n--- aidef Runtime Summary ---");
    let successfulLeaves = 0;
    let failedLeaves = 0;

    results.forEach((result, index) => {
      const leafPath = leafFiles[index];
      if (result.status === 'fulfilled') {
        const execResult = result.value as LeafExecutionResult;
        if (execResult.success) {
          console.log(`[SUCCESS] ${execResult.leafPath}: ${execResult.message}`);
          successfulLeaves++;
        } else {
          console.error(`[FAILED] ${execResult.leafPath}: ${execResult.message}`);
          failedLeaves++;
        }
      } else {
        // This case should ideally be caught by the executeLeaf's internal try/catch
        // but is here for robustness if a promise rejection occurs before the final result object is formed.
        console.error(`[FAILED] ${leafPath}: Unhandled promise rejection - ${result.reason}`);
        failedLeaves++;
      }
    });

    console.log(`\nTotal Leaves: ${leafFiles.length}`);
    console.log(`Successful: ${successfulLeaves}`);
    console.log(`Failed: ${failedLeaves}`);

    console.log("--- aidef Runtime Finished ---\n");

  } catch (error) {
    console.error("An unexpected error occurred during runtime execution:", error);
  }
}

// Example of how to run the runtime (e.g., if this file is executed directly)
// if (require.main === module) {
//   runAidefRuntime().catch(console.error);
// }
