/**
 * AIDef Runtime
 * 
 * Executes the compiled plan:
 * 1. Finds all leaf nodes (.gen.aid.leaf.json files)
 * 2. Runs whitelisted commands
 * 3. Generates code files using LLM
 * 4. Logs all operations
 */

import { GoogleGenAI, Type } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { GenLeaf, DEFAULT_COMMAND_WHITELIST, LogEntry } from '../types';

export class AidRuntime {
  private ai: GoogleGenAI | null = null;
  private logPath: string;
  private commandWhitelist: string[];
  private outputDir: string;

  constructor(apiKey?: string, outputDir?: string, additionalCommands: string[] = []) {
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
    this.outputDir = outputDir || process.cwd();
    this.logPath = path.join(this.outputDir, 'runtime.log.jsonl');
    this.commandWhitelist = [...DEFAULT_COMMAND_WHITELIST, ...additionalCommands];
  }

  /**
   * Run all leaf nodes in the compiled plan
   */
  async run(): Promise<void> {
    console.log('[runtime] Starting...');
    
    // Clear previous log
    if (fs.existsSync(this.logPath)) {
      fs.unlinkSync(this.logPath);
    }

    // Find all leaf nodes in output directory
    const leaves = this.findLeaves(this.outputDir);
    console.log(`[runtime] Found ${leaves.length} leaf node(s)`);

    if (leaves.length === 0) {
      console.log('[runtime] No leaves found. Run "aidef compile" first.');
      return;
    }

    // Execute leaves in parallel
    const results = await Promise.allSettled(
      leaves.map(leaf => this.executeLeaf(leaf))
    );

    // Summary
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`[runtime] Complete: ${succeeded} succeeded, ${failed} failed`);
    console.log(`[runtime] Log: ${this.logPath}`);
  }

  /**
   * Find all leaf.json files in directory tree
   */
  private findLeaves(dir: string): GenLeaf[] {
    const leaves: GenLeaf[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip node_modules and hidden dirs
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          leaves.push(...this.findLeaves(fullPath));
        } else if (entry.name.endsWith('.leaf.json')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const leaf = JSON.parse(content) as GenLeaf;
            // Ensure dir is set correctly
            leaf.dir = path.dirname(fullPath);
            leaf.path = fullPath;
            leaves.push(leaf);
          } catch (error) {
            console.warn(`[runtime] Invalid leaf file: ${fullPath}`);
          }
        }
      }
    } catch {
      // Directory not accessible
    }

    return leaves;
  }

  /**
   * Execute a single leaf node
   */
  private async executeLeaf(leaf: GenLeaf): Promise<void> {
    console.log(`\n[runtime] Executing: ${leaf.path}`);

    // Determine output directory (relative to project root in outputDir)
    const outputPath = leaf.outputPath 
      ? path.join(this.outputDir, leaf.outputPath)
      : leaf.dir;

    // Ensure output directory exists
    const outputDir = outputPath.endsWith('.ts') || outputPath.endsWith('.js')
      ? path.dirname(outputPath)
      : outputPath;
    fs.mkdirSync(outputDir, { recursive: true });

    // Step 1: Run commands (in output directory)
    if (leaf.commands && leaf.commands.length > 0) {
      for (const cmd of leaf.commands) {
        await this.runCommand(cmd, outputDir);
      }
    }

    // Step 2: Generate files (to output directory)
    if (leaf.files && leaf.files.length > 0) {
      await this.generateFiles(leaf, outputDir);
    }
  }

  /**
   * Run a whitelisted command
   */
  private async runCommand(command: string, cwd: string): Promise<void> {
    // Check whitelist
    const isAllowed = this.commandWhitelist.some(allowed => 
      command === allowed || command.startsWith(allowed + ' ')
    );

    if (!isAllowed) {
      console.warn(`[runtime] Command not whitelisted: ${command}`);
      this.log({
        timestamp: new Date().toISOString(),
        type: 'error',
        details: { command, error: 'Not whitelisted' }
      });
      return;
    }

    console.log(`[runtime] Running: ${command}`);

    try {
      execSync(command, {
        cwd,
        stdio: 'inherit',
        timeout: 120000 // 2 minute timeout
      });

      this.log({
        timestamp: new Date().toISOString(),
        type: 'command',
        details: { command, cwd, success: true }
      });
    } catch (error) {
      console.error(`[runtime] Command failed: ${command}`);
      this.log({
        timestamp: new Date().toISOString(),
        type: 'error',
        details: { command, cwd, error: String(error) }
      });
    }
  }

  /**
   * Generate files using LLM
   */
  private async generateFiles(leaf: GenLeaf, outputDir: string): Promise<void> {
    if (!this.ai) {
      console.warn('[runtime] No API key - cannot generate files');
      return;
    }

    const tools = [
      {
        name: 'write_file',
        description: 'Write content to a file',
        parameters: {
          type: Type.OBJECT,
          properties: {
            path: { 
              type: Type.STRING, 
              description: 'File path (relative to leaf directory)' 
            },
            content: { 
              type: Type.STRING, 
              description: 'Complete file content' 
            }
          },
          required: ['path', 'content']
        }
      }
    ];

    const systemPrompt = `You are generating code files.

You MUST create these files (using ONLY the filename, not paths): ${leaf.files.join(', ')}

Use the write_file tool for each file. Create complete, working code.
The write_file tool's "path" parameter should be JUST the filename (e.g., "index.ts", NOT "src/index.ts").

CRITICAL: DO NOT DIVERGE FROM THE PROMPT INSTRUCTIONS.
- If the prompt says to use "@google/genai", use EXACTLY "@google/genai", not "@google/generative-ai"
- If the prompt says to use "GoogleGenAI", use EXACTLY "GoogleGenAI", not "GoogleGenerativeAI"
- If the prompt shows specific API patterns, use those EXACT patterns
- If the prompt shows interface definitions, implement them EXACTLY as shown
- Do not substitute similar-sounding packages, classes, or method names
- NEVER use GoogleGenerativeAI - the correct class name is GoogleGenAI

IMPORTANT STRING SYNTAX RULES:
- Use normal single quotes (') and double quotes (") in your code
- NEVER escape quotes with backslash like \\' or \\" - this creates invalid JavaScript
- Example: import foo from 'bar' is correct, import foo from \\'bar\\' is WRONG
- Only escape quotes INSIDE strings when needed, not in import statements or normal code

## CRITICAL TypeScript Syntax Rules

When writing TypeScript/JavaScript code, you MUST follow these rules:

1. **Multi-line strings**: NEVER use single quotes (') or double quotes (") for strings that span multiple lines. 
   Use template literals (backticks \`) instead.
   
   WRONG (will cause syntax errors):
   console.log('line 1
   line 2');
   
   CORRECT:
   console.log(\`line 1
   line 2\`);

2. **String escaping**: If you need literal backticks inside a template literal, escape them with backslash.

3. **Import syntax**: Use 'import type' for type-only imports when using verbatimModuleSyntax.

4. **Bun APIs**: Use Bun.file() for file operations, Bun.spawn() for processes.

5. **DO NOT redeclare imports**: If you import something, don't also declare a stub for it.
   WRONG: import { Foo } from './foo'; export class Foo { }  // Conflict!
   CORRECT: import { Foo } from './foo'; // Just use Foo, don't redeclare

6. **Apostrophes in strings**: Use escaped apostrophe or double quotes for strings containing apostrophes.
   WRONG: 'node's content'  // Syntax error
   CORRECT: "node's content" or 'node\\'s content' or \`node's content\``;

    try {
      // CORRECT API PATTERN: use models.generateContent with conversation history
      const history: Array<{role: 'user' | 'model' | 'function', parts: Array<any>}> = [];

      // Initial user message with system prompt as preamble
      const fullPrompt = `${systemPrompt}\n\n---\n\n${leaf.prompt}`;
      history.push({ role: 'user', parts: [{ text: fullPrompt }] });

      let response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: history,
        config: {
          temperature: 0,
          tools: [{ functionDeclarations: tools }]
        }
      });

      // Track which files we've written
      const writtenFiles = new Set<string>();
      let step = 0;
      const maxSteps = 30;

      while (step < maxSteps) {
        step++;

        const functionCalls = response.functionCalls;
        if (!functionCalls || functionCalls.length === 0) {
          // Check if there are files still needed
          const missingFiles = leaf.files.filter(f => !writtenFiles.has(f));
          if (missingFiles.length === 0) {
            break; // All done
          }
          
          // LLM returned text instead of function calls - prompt it again
          if (response.text) {
            history.push({ role: 'model', parts: [{ text: response.text }] });
          }
          
          const nudge = `You MUST use the write_file tool to create these files: ${missingFiles.join(', ')}. Please call write_file now.`;
          history.push({ role: 'user', parts: [{ text: nudge }] });
          
          response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: history,
            config: {
              temperature: 0,
              tools: [{ functionDeclarations: tools }]
            }
          });
          continue;
        }

        // Add model response to history
        history.push({
          role: 'model',
          parts: functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } }))
        });

        const functionResponses: Array<{functionResponse: {name: string, response: any}}> = [];

        for (const call of functionCalls) {
          if (call.name === 'write_file') {
            const filePath = call.args?.path as string;
            const content = call.args?.content as string;

            // Security: validate path
            if (!filePath || filePath.includes('..') || path.isAbsolute(filePath)) {
              functionResponses.push({
                functionResponse: { name: call.name, response: { error: 'Invalid path' } }
              });
              continue;
            }

            // Check if file is in allowed list
            if (!leaf.files.includes(filePath)) {
              console.warn(`[runtime] File not in allowed list: ${filePath}`);
              // Allow it anyway but warn
            }

            const absolutePath = path.join(outputDir, filePath);
            
            // Ensure directory exists
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            
            // Prepend generated file header
            const header = this.getGeneratedHeader(filePath, leaf.sourceAid);
            const contentWithHeader = header ? header + '\n' + content : content;
            
            // Write file
            fs.writeFileSync(absolutePath, contentWithHeader, 'utf-8');
            writtenFiles.add(filePath);
            console.log(`[runtime] Wrote: ${filePath}`);

            this.log({
              timestamp: new Date().toISOString(),
              type: 'file_write',
              leaf: leaf.path,
              details: { path: absolutePath, size: content.length }
            });

            functionResponses.push({
              functionResponse: { name: call.name, response: { success: true, path: filePath } }
            });
          }
        }

        if (functionResponses.length === 0) {
          break;
        }

        // Add function responses to history
        history.push({ role: 'function', parts: functionResponses });

        // Continue conversation
        response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: history,
          config: {
            temperature: 0,
            tools: [{ functionDeclarations: tools }]
          }
        });
      }

      // Check if all required files were written
      const missingFiles = leaf.files.filter(f => !writtenFiles.has(f));
      if (missingFiles.length > 0) {
        console.warn(`[runtime] Missing files: ${missingFiles.join(', ')}`);
      }

      this.log({
        timestamp: new Date().toISOString(),
        type: 'llm_call',
        leaf: leaf.path,
        details: { 
          filesRequested: leaf.files,
          filesWritten: Array.from(writtenFiles),
          steps: step
        }
      });

    } catch (error) {
      console.error(`[runtime] Generation failed for ${leaf.path}:`, error);
      this.log({
        timestamp: new Date().toISOString(),
        type: 'error',
        leaf: leaf.path,
        details: { error: String(error) }
      });
    }
  }

  /**
   * Get the generated file header based on file extension
   */
  private getGeneratedHeader(filePath: string, sourceAid: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    const message = `Generated by aidef. Edit ${sourceAid} to change behavior.`;
    
    switch (ext) {
      case '.ts':
      case '.js':
      case '.tsx':
      case '.jsx':
        return `// ${message}`;
      case '.py':
      case '.yaml':
      case '.yml':
        return `# ${message}`;
      case '.css':
      case '.scss':
        return `/* ${message} */`;
      case '.html':
      case '.xml':
      case '.svg':
      case '.md':
        return `<!-- ${message} -->`;
      case '.json':
        return null; // JSON doesn't support comments
      default:
        return `// ${message}`; // Default to // style
    }
  }

  /**
   * Append to log file
   */
  private log(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.logPath, line);
  }
}

export interface RuntimeConfig {
  maxParallel?: number;
  maxRetries?: number;
  rateLimits?: {
    tokensPerMinute?: number;
    requestsPerMinute?: number;
  };
}

export async function run(outputDir: string, apiKey: string, config?: RuntimeConfig): Promise<void> {
  if (config?.rateLimits?.tokensPerMinute || config?.rateLimits?.requestsPerMinute) {
    console.log('[runtime] Rate limits configured:', {
      tokensPerMinute: config.rateLimits.tokensPerMinute ?? 'unlimited',
      requestsPerMinute: config.rateLimits.requestsPerMinute ?? 'unlimited',
    });
  }
  if (config?.maxParallel) {
    console.log(`[runtime] Max parallel: ${config.maxParallel}`);
  }
  if (config?.maxRetries) {
    console.log(`[runtime] Max retries: ${config.maxRetries}`);
  }

  const runtime = new AidRuntime(apiKey, outputDir);
  await runtime.run();
}

