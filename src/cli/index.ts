#!/usr/bin/env bun
/**
 * AIDef CLI Entry Point
 * 
 * Parses command line arguments and dispatches to appropriate command handlers.
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { CLIOptions } from "../types";
import { runCommand } from "./commands/run";
import { browseCommand } from "./commands/browse";
import { buildCommand } from "./commands/build";
import { authCommand } from "./commands/auth";
import { estimateCommand } from "./commands/estimate";

const HELP_TEXT = `AIDef - AI-powered code generation from specifications

Usage: aid [options]

Options:
  --browse          Open TUI to browse and edit generated specs
  --build           Run build phase (generate code from leaf nodes)
  --auth            Configure provider authentication
  --estimate        Estimate compilation cost without running
  --continue        Resume previous compilation from saved state
  --verbose         Show detailed progress
  --max-nodes=N     Maximum nodes to compile (default: 100)
  --max-calls=N     Maximum AI calls to make (default: 100)
  --max-parallel=N  Maximum parallel compilations (default: 10)
  --help            Show this help

Examples:
  aid                       Compile root.aid
  aid --continue            Resume previous compilation
  aid --browse              Open TUI
  aid --build               Generate code
  aid --max-nodes=50        Limit compilation to 50 nodes
  aid --max-parallel=5      Limit to 5 parallel AI calls
`;

export interface ParsedArgs {
  command: CLIOptions["command"];
  verbose: boolean;
  help: boolean;
  maxNodes: number;
  maxCalls: number;
  maxParallel: number;
  continueFromState: boolean;
}

export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: "run",
    verbose: false,
    help: false,
    maxNodes: 10,
    maxCalls: 20,
    maxParallel: 10,
    continueFromState: false,
  };

  for (const arg of args) {
    // Handle --key=value style args
    if (arg.startsWith("--max-nodes=")) {
      const value = parseInt(arg.slice("--max-nodes=".length), 10);
      if (!isNaN(value) && value > 0) {
        result.maxNodes = value;
      }
      continue;
    }
    if (arg.startsWith("--max-calls=")) {
      const value = parseInt(arg.slice("--max-calls=".length), 10);
      if (!isNaN(value) && value > 0) {
        result.maxCalls = value;
      }
      continue;
    }
    if (arg.startsWith("--max-parallel=")) {
      const value = parseInt(arg.slice("--max-parallel=".length), 10);
      if (!isNaN(value) && value > 0) {
        result.maxParallel = value;
      }
      continue;
    }

    switch (arg) {
      case "--browse":
        result.command = "browse";
        break;
      case "--build":
        result.command = "build";
        break;
      case "--auth":
        result.command = "auth";
        break;
      case "--estimate":
        result.command = "estimate";
        break;
      case "--continue":
        result.continueFromState = true;
        break;
      case "--verbose":
      case "-v":
        result.verbose = true;
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
    }
  }

  return result;
}

export function findRootAid(cwd: string): string | null {
  const rootPath = join(cwd, "root.aid");
  if (existsSync(rootPath)) {
    return rootPath;
  }
  return null;
}

export function ensureAidGenDir(cwd: string): void {
  const aidPlanPath = join(cwd, ".aid-plan");
  if (!existsSync(aidPlanPath)) {
    mkdirSync(aidPlanPath, { recursive: true });
  }
}

export function printHelp(): void {
  console.log(HELP_TEXT);
}

async function main(): Promise<number> {
  // Skip first two args (bun and script path)
  const args = Bun.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.help) {
    printHelp();
    return 0;
  }

  const cwd = process.cwd();
  const rootPath = findRootAid(cwd);

  if (!rootPath) {
    console.error("Error: root.aid not found in current directory");
    console.error("Run 'aid --help' for usage information");
    return 1;
  }

  // Create .aid-plan/ directory if it doesn't exist
  ensureAidGenDir(cwd);

  const options: CLIOptions = {
    command: parsed.command,
    rootPath: resolve(rootPath),
    verbose: parsed.verbose,
    maxNodes: parsed.maxNodes,
    maxCalls: parsed.maxCalls,
    maxParallel: parsed.maxParallel,
    continueFromState: parsed.continueFromState,
  };

  // Dispatch to appropriate command
  switch (options.command) {
    case "run":
      return runCommand(options);
    case "browse":
      return browseCommand(options);
    case "build":
      return buildCommand(options);
    case "auth":
      return authCommand(options);
    case "estimate":
      return estimateCommand(options);
    default:
      console.error(`Unknown command: ${options.command}`);
      return 1;
  }
}

// Run if executed directly
if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
