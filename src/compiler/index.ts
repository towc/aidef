// src/compiler/index.ts
import { parseAidFile } from './parser';
import { writeFileSync } from '../utils/file';

export function compile(rootAidPath: string) {
  console.log(`Starting compilation for ${rootAidPath}`);
  try {
    const processedContent = parseAidFile(rootAidPath);
    console.log('Processed .aid content (after include resolution):');
    console.log(processedContent);

    // In 'human' mode, we resolve includes and generate a single node.gen.aid
    const outputPath = 'src/node.gen.aid';
    writeFileSync(outputPath, processedContent);
    console.log(`Generated entry point: ${outputPath}`);

  } catch (error: any) {
    console.error('Compilation failed:', error.message);
  }
}
