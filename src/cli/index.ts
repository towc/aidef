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
  --browse    Open TUI to browse and edit generated specs
  --build     Run build phase (generate code from leaf nodes)
  --auth      Configure provider authentication
  --estimate  Estimate compilation cost without running
  --verbose   Show detailed progress
  --help      Show this help

Examples:
  aid                 Compile root.aid
  aid --browse        Open TUI
  aid --build         Generate code
`;

export interface ParsedArgs {
  command: CLIOptions["command"];
  verbose: boolean;
  help: boolean;
}

export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: "run",
    verbose: false,
    help: false,
  };

  for (const arg of args) {
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
  const aidGenPath = join(cwd, ".aid-gen");
  if (!existsSync(aidGenPath)) {
    mkdirSync(aidGenPath, { recursive: true });
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

  // Create .aid-gen/ directory if it doesn't exist
  ensureAidGenDir(cwd);

  const options: CLIOptions = {
    command: parsed.command,
    rootPath: resolve(rootPath),
    verbose: parsed.verbose,
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
