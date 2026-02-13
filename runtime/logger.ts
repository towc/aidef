import * as fs from 'fs/promises';
import * as path from 'path';

interface AILogEntry {
  timestamp: string;
  leafPath: string;
  prompt: string;
  generatedFiles: { fileName: string; contentPreview: string }[];
  success: boolean;
  error?: string;
}

const LOG_FILE_PATH = path.join(process.cwd(), 'runtime.log.jsonl');

export async function logAICall(entry: AILogEntry): Promise<void> {
  try {
    const logLine = JSON.stringify(entry) + '\n';
    await fs.appendFile(LOG_FILE_PATH, logLine, 'utf8');
    console.log(`[Logger] AI call logged for leaf: ${entry.leafPath}`);
  } catch (error) {
    console.error(`[Logger] Failed to log AI call for leaf ${entry.leafPath}:`, error);
  }
}
