
import * as process from 'process';
import { analyse } from './analysis';
import { startTui } from './tui';

function displayHelp() {
    console.log(`
Usage: aidef [command]

Commands:
  --compile    Runs the compiler to completion.
  --run        Executes the runtime.
  --analyse    Analyzes compiled plans and AI call logs, generating map and info files.
  --browse     Starts the TUI to inspect compiled plans and analysis output.
  --help       Display this help message.
    `);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        displayHelp();
        return;
    }

    const command = args[0];

    switch (command) {
        case '--compile':
            console.log('Running the compiler...');
            // Placeholder for compiler logic
            // await compile();
            console.log('Compiler finished.');
            break;
        case '--run':
            console.log('Executing the runtime...');
            // Placeholder for runtime logic
            // await run();
            console.log('Runtime finished.');
            break;
        case '--analyse':
            console.log('Starting analysis...');
            // In a real scenario, you'd pass actual paths to compiled plans and logs
            await analyse('path/to/compiled_plan.json', 'path/to/ai_call_logs.json');
            console.log('Analysis complete.');
            break;
        case '--browse':
            console.log('Starting TUI browser...');
            // In a real scenario, you'd pass actual paths to compiled plans and analysis info
            await startTui('path/to/compiled_plan.json', 'path/to/analysis.gen.aid.info');
            break;
        default:
            console.error(`Unknown command: ${command}`);
            displayHelp();
            process.exit(1);
    }
}

main().catch(error => {
    console.error('An error occurred:', error);
    process.exit(1);
});
