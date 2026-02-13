#!/usr/bin/env bun
/**
 * AIDef CLI
 * 
 * Commands:
 *   compile  - Compile root.aid into execution plan
 *   run      - Execute the compiled plan
 *   analyse  - Analyze and suggest improvements (TODO)
 *   browse   - Interactive TUI for the plan (TODO)
 */

import * as path from 'node:path';
import { HumanCompiler } from './compiler/human';
import { GenCompiler } from './compiler/gen';
import { AidRuntime } from './runtime';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY;

  switch (command) {
    case 'compile':
    case '--compile': {
      const rootFile = args[1] || 'root.aid';
      await compile(rootFile, apiKey);
      break;
    }

    case 'run':
    case '--run': {
      await run(apiKey);
      break;
    }

    case 'analyse':
    case '--analyse':
    case 'analyze':
    case '--analyze': {
      console.log('Analysis not yet implemented.');
      console.log('This will analyze the compiled plan and suggest improvements.');
      break;
    }

    case 'browse':
    case '--browse': {
      console.log('Browse TUI not yet implemented.');
      console.log('This will provide an interactive interface to explore the plan.');
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default: {
      printHelp();
      break;
    }
  }
}

/**
 * Compile .aid files into execution plan
 */
async function compile(rootFile: string, apiKey?: string): Promise<void> {
  console.log('=== AIDef Compilation ===\n');

  // Step 1: Human compilation (resolve includes)
  console.log('Phase 1: Resolving includes...');
  const humanCompiler = new HumanCompiler();
  const genAidPath = await humanCompiler.compile(rootFile);
  console.log();

  // Step 2: Gen compilation (LLM processing)
  if (apiKey) {
    console.log('Phase 2: LLM compilation...');
    const genCompiler = new GenCompiler(apiKey);
    await genCompiler.compile(genAidPath);
    console.log();
  } else {
    console.log('Phase 2: Skipped (no GEMINI_API_KEY)');
    console.log('Set GEMINI_API_KEY to enable LLM-powered compilation.');
    console.log();
  }

  console.log('=== Compilation Complete ===');
  console.log(`Entry point: ${genAidPath}`);
  console.log('Run "aidef run" to execute the plan.');
}

/**
 * Run the compiled execution plan
 */
async function run(apiKey?: string): Promise<void> {
  console.log('=== AIDef Runtime ===\n');

  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY required for runtime');
    console.log('Set GEMINI_API_KEY environment variable.');
    process.exit(1);
  }

  const runtime = new AidRuntime(apiKey);
  await runtime.run();

  console.log('\n=== Runtime Complete ===');
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
AIDef - AI Definition Language

Usage: aidef <command> [options]

Commands:
  compile [file]   Compile .aid file (default: root.aid)
  run              Execute the compiled plan
  analyse          Analyze plan and suggest improvements
  browse           Interactive TUI for exploring the plan

Environment:
  GEMINI_API_KEY   Required for LLM compilation and runtime

Examples:
  aidef compile              # Compile root.aid
  aidef compile my-app.aid   # Compile custom file
  aidef run                  # Execute the plan

Documentation: https://github.com/towc/aidef
`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
