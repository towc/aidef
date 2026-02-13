/**
 * Call Logger
 * 
 * Logs all AI provider calls to .aid-plan/calls.jsonl for debugging,
 * cost tracking, and reproducibility.
 */

import { mkdir, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CallLogEntry } from '../types';

// =============================================================================
// CallLogger Class
// =============================================================================

export class CallLogger {
  private logPath: string;
  private initialized: boolean = false;
  
  /**
   * Create a new CallLogger.
   * @param aidPlanDir - Path to the .aid-plan directory (defaults to .aid-plan)
   */
  constructor(aidPlanDir: string = '.aid-plan') {
    this.logPath = join(aidPlanDir, 'calls.jsonl');
  }
  
  /**
   * Ensure the log directory exists.
   */
  private async ensureDir(): Promise<void> {
    if (this.initialized) return;
    
    await mkdir(dirname(this.logPath), { recursive: true });
    this.initialized = true;
  }
  
  /**
   * Log a call entry.
   */
  async log(entry: CallLogEntry): Promise<void> {
    await this.ensureDir();
    
    const line = JSON.stringify(entry) + '\n';
    await appendFile(this.logPath, line, 'utf-8');
  }
  
  /**
   * Create a CallLogEntry with common fields filled in.
   */
  createEntry(partial: Partial<CallLogEntry> & {
    node: string;
    phase: 'compile' | 'generate';
    provider: string;
    model: string;
    input: string;
    output: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    success: boolean;
  }): CallLogEntry {
    return {
      id: partial.id || generateId(),
      timestamp: partial.timestamp || new Date().toISOString(),
      ...partial,
    };
  }
  
  /**
   * Get the path to the log file.
   */
  getLogPath(): string {
    return this.logPath;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultLogger: CallLogger | null = null;

/**
 * Get the default CallLogger instance.
 */
export function getCallLogger(): CallLogger {
  if (!defaultLogger) {
    defaultLogger = new CallLogger();
  }
  return defaultLogger;
}

/**
 * Set a custom CallLogger as the default (useful for testing).
 */
export function setCallLogger(logger: CallLogger): void {
  defaultLogger = logger;
}

/**
 * Reset the default logger (useful for testing).
 */
export function resetCallLogger(): void {
  defaultLogger = null;
}
