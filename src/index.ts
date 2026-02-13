// src/index.ts
// Note: `commander` library is required for this CLI to run.
// Please install it via: `bun add commander` or `npm install commander`
import { Command } from 'commander';
import { compile } from './compiler';
// import { run } from './runtime'; // Not yet implemented
// import { analyze } from './analyzer'; // Not yet implemented
// import { browse } from './browser'; // Not yet implemented

const program = new Command();

program
  .name('aidef')
  .description('AIDef: AI Definition Language build tool')
  .version('0.1.0');

program
  .command('compile')
  .description('Runs the compiler to completion')
  .option('-p, --path <path>', 'Path to the root .aid file', 'root.aid')
  .action((options) => {
    console.log(`Compiling project from ${options.path}...`);
    compile(options.path);
  });

program
  .command('run')
  .description('Executes the runtime')
  .action(() => {
    console.log('Running the compiled plan...');
    // run(); // Call runtime function
  });

program
  .command('analyse')
  .description('Analyzes the compiled plan and AI call logs')
  .action(() => {
    console.log('Analyzing the project...');
    // analyze(); // Call analyzer function
  });

program
  .command('browse')
  .description('A TUI tool to inspect the plan files and analysis output')
  .action(() => {
    console.log('Browsing the project...');
    // browse(); // Call browser function
  });

program.parse(process.argv);
