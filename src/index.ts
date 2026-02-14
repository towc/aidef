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

import * as fs from 'node:fs';
import * as path from 'node:path';
import { HumanCompiler } from './compiler/human';
import { GenCompiler } from './compiler/gen';
import { AidRuntime } from './runtime';

interface CliOptions {
  output?: string;
  maxParallel?: number;
  maxRetries?: number;
  maxDepth?: number;
}

/**
 * Parse CLI arguments into options
 */
function parseArgs(args: string[]): { command: string; file?: string; options: CliOptions } {
  const options: CliOptions = {};
  let command = 'help';
  let file: string | undefined;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--max-parallel') {
      options.maxParallel = parseInt(args[++i], 10);
    } else if (arg === '--max-retries') {
      options.maxRetries = parseInt(args[++i], 10);
    } else if (arg === '--max-depth') {
      options.maxDepth = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      if (!command || command === 'help') {
        command = arg;
      } else if (!file) {
        file = arg;
      }
    } else if (arg === 'help' || arg === '--help' || arg === '-h') {
      command = 'help';
    }
  }
  
  return { command, file, options };
}

/**
 * Get the next available output directory
 */
function getNextOutputDir(): string {
  let n = 0;
  while (fs.existsSync(`/tmp/aidef-${n}`)) {
    n++;
  }
  return `/tmp/aidef-${n}`;
}

async function main() {
  const { command, file, options } = parseArgs(process.argv.slice(2));

  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY;

  switch (command) {
    case 'compile': {
      const rootFile = file || 'root.aid';
      const outputDir = options.output || getNextOutputDir();
      await compile(rootFile, outputDir, apiKey);
      break;
    }

    case 'run': {
      if (!options.output) {
        console.error('Error: --output required for run command');
        console.log('Usage: aidef run --output <dir>');
        process.exit(1);
      }
      await run(options.output, apiKey);
      break;
    }

    case 'analyse':
    case 'analyze': {
      if (!options.output) {
        console.error('Error: --output required for analyse command');
        console.log('Usage: aidef analyse --output <dir>');
        process.exit(1);
      }
      console.log('Analysis not yet implemented.');
      console.log('This will analyze the compiled plan and suggest improvements.');
      break;
    }

    case 'browse': {
      if (!options.output) {
        console.error('Error: --output required for browse command');
        console.log('Usage: aidef browse --output <dir>');
        process.exit(1);
      }
      console.log('Browse TUI not yet implemented.');
      console.log('This will provide an interactive interface to explore the plan.');
      break;
    }

    case 'help':
    default: {
      printHelp();
      break;
    }
  }
}

/**
 * Compile .aid files into execution plan
 */
async function compile(rootFile: string, outputDir: string, apiKey?: string): Promise<void> {
  console.log('=== AIDef Compilation ===\n');
  console.log(`Output directory: ${outputDir}\n`);

  // Step 1: Resolver phase (resolve includes)
  console.log('Phase 1: Resolving includes...');
  const resolver = new HumanCompiler(outputDir);
  const genAidPath = await resolver.compile(rootFile);
  console.log();

  // Step 2: Compiler phase (LLM processing)
  if (apiKey) {
    console.log('Phase 2: LLM compilation...');
    const compiler = new GenCompiler(apiKey);
    await compiler.compile(genAidPath);
    console.log();
  } else {
    console.log('Phase 2: Skipped (no GEMINI_API_KEY)');
    console.log('Set GEMINI_API_KEY to enable LLM-powered compilation.');
    console.log();
  }

  console.log('=== Compilation Complete ===');
  console.log(`Output directory: ${outputDir}`);
  console.log(`Entry point: ${genAidPath}`);
  console.log(`Run "aidef run --output ${outputDir}" to execute the plan.`);
}

/**
 * Run the compiled execution plan
 */
async function run(outputDir: string, apiKey?: string): Promise<void> {
  console.log('=== AIDef Runtime ===\n');
  console.log(`Output directory: ${outputDir}\n`);

  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY required for runtime');
    console.log('Set GEMINI_API_KEY environment variable.');
    process.exit(1);
  }

  const runtime = new AidRuntime(apiKey, outputDir);
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
  compile [file]           Compile .aid file (default: root.aid)
  run --output <dir>       Execute the compiled plan
  analyse --output <dir>   Analyze plan and suggest improvements
  browse --output <dir>    Interactive TUI for exploring the plan

Options:
  --output, -o <dir>       Output directory (default: /tmp/aidef-<n>)
  --max-parallel <num>     Max parallel LLM calls (default: 10)
  --max-retries <num>      Max retries for failed LLM calls (default: 3)
  --max-depth <num>        Max node depth during compilation (default: 5)

Environment:
  GEMINI_API_KEY           Required for LLM compilation and runtime

Examples:
  aidef compile                           # Compile root.aid to /tmp/aidef-0
  aidef compile --output /tmp/myproject   # Compile to specific directory
  aidef compile my-app.aid                # Compile custom file
  aidef run --output /tmp/aidef-0         # Execute the plan

Documentation: https://github.com/towc/aidef
`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
