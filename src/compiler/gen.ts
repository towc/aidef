/**
 * Gen Compiler
 * 
 * Processes .gen.aid files using LLM to spawn child nodes and leaves.
 * 
 * Key concepts:
 * - Each node defines interfaces FIRST, then spawns children
 * - Children can only see what parent explicitly passes
 * - Leaves are atomic tasks with specific file outputs
 * - Tree diffing skips unchanged branches
 */

import { GoogleGenAI, Type } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GenNodeArgs, GenLeafArgs, GenLeaf } from '../types';
import { TreeDiffer } from './diff';

/** System prompt explaining how to process .aid specs */
const SYSTEM_PROMPT = `You are the AIDef compiler. You process .aid specifications and create LEAF NODES that generate actual code.

## CRITICAL RULES

1. **PREFER gen_leaf over gen_node** - Only use gen_node for truly complex modules that have 3+ distinct subcomponents
2. **NO INFINITE RECURSION** - Never create a child node with the same or similar name as its parent
3. **DEPTH LIMIT** - After 2-3 levels of nodes, you MUST create leaves
4. **ATOMIC TASKS** - Each leaf should be a specific, implementable task

## Tools

### gen_leaf (PREFERRED)
Create a leaf that generates actual code files. Use this for:
- Single modules/files with clear interfaces
- Utility functions
- Type definitions
- Any task a developer could implement in 1-2 hours

Required fields:
- name: Short identifier (e.g., "parser", "types", "cli")
- prompt: DETAILED instructions including exact function signatures, types, behavior
- files: List of files to create (e.g., ["index.ts", "types.ts"])

### gen_node (USE SPARINGLY)
Only for complex subsystems with multiple distinct parts. Examples:
- "compiler" with parser, human, gen subcomponents
- "server" with routes, middleware, database subcomponents

## Example Good Leaf

gen_leaf({
  name: "parser",
  prompt: "Create an .aid file parser with these exports:
    - parse(content: string): AidNode[]
    - AidNode = AidModule | AidParam | AidInclude | AidProse
    - AidModule = { type: 'module', name: string, content: AidNode[] }
    - Handle: modules { }, params=value;, include path;, # comments",
  files: ["parser.ts", "types.ts"]
})

## Example Bad Pattern (DO NOT DO)

gen_node({ name: "analyzer" }) 
  -> gen_node({ name: "analyse" })  // Same concept, infinite loop!
    -> gen_node({ name: "analyse_mode" })  // Still recursing!

Instead: Just create a gen_leaf with clear instructions.`;

const MAX_DEPTH = 3; // Maximum nesting depth

export class GenCompiler {
  private ai: GoogleGenAI;
  private differ: TreeDiffer;
  private fileCollisions: Map<string, string> = new Map(); // file -> leaf that owns it

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY required for GenCompiler');
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.differ = new TreeDiffer();
  }

  /**
   * Compile a .gen.aid file, recursively processing children.
   */
  async compile(genAidPath: string, depth: number = 0): Promise<void> {
    const nodeDir = path.dirname(genAidPath);
    console.log(`[gen] Compiling ${genAidPath}`);

    // Read content
    let content: string;
    try {
      content = fs.readFileSync(genAidPath, 'utf-8');
    } catch (error) {
      console.error(`[gen] Failed to read ${genAidPath}:`, error);
      return;
    }

    // Check for tree diff - skip if unchanged
    const previousContent = this.differ.loadPrevious(genAidPath);
    if (previousContent && this.differ.isUnchanged(previousContent, content)) {
      console.log(`[gen] Skipping unchanged: ${genAidPath}`);
      return;
    }

    // If changed, prune the old branch first
    if (previousContent) {
      console.log(`[gen] Content changed, pruning old branch`);
      this.differ.pruneBranch(nodeDir);
    }

    // Check depth limit
    if (depth >= MAX_DEPTH) {
      console.log(`[gen] Max depth reached (${MAX_DEPTH}), forcing leaf creation`);
    }

    // Process with LLM
    await this.processWithLLM(content, nodeDir, depth);

    // Save for future diffing
    this.differ.savePrevious(genAidPath, content);
  }

  /**
   * Use LLM to process the .aid content and generate children
   */
  private async processWithLLM(content: string, nodeDir: string, depth: number): Promise<void> {
    // Only allow gen_node if we haven't reached max depth
    const allowNodes = depth < MAX_DEPTH;
    
    const tools = allowNodes ? [
      {
        name: 'gen_node',
        description: 'Create a child node for a complex sub-task with 3+ subcomponents. USE SPARINGLY.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { 
              type: Type.STRING, 
              description: 'Name of the child node - must be different from parent!' 
            },
            content: { 
              type: Type.STRING, 
              description: 'The .aid specification for this child - be specific!' 
            }
          },
          required: ['name', 'content']
        }
      },
      {
        name: 'gen_leaf',
        description: 'Create a leaf node for actual code generation. PREFERRED CHOICE.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { 
              type: Type.STRING, 
              description: 'Name of the leaf (becomes folder name)' 
            },
            prompt: { 
              type: Type.STRING, 
              description: 'DETAILED instructions with exact types, function signatures, behavior' 
            },
            files: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Files this leaf will create'
            },
            commands: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Shell commands to run (npm install, bun install only)'
            }
          },
          required: ['name', 'prompt', 'files']
        }
      }
    ] : [
      // At max depth, only allow leaf creation
      {
        name: 'gen_leaf',
        description: 'Create a leaf node for actual code generation.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { 
              type: Type.STRING, 
              description: 'Name of the leaf (becomes folder name)' 
            },
            prompt: { 
              type: Type.STRING, 
              description: 'DETAILED instructions with exact types, function signatures, behavior' 
            },
            files: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Files this leaf will create'
            },
            commands: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Shell commands to run (npm install, bun install only)'
            }
          },
          required: ['name', 'prompt', 'files']
        }
      }
    ];

    try {
      const chat = this.ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: tools }],
          temperature: 0, // Deterministic for tree diffing
        }
      });

      let response = await chat.sendMessage({
        message: `Process this .aid specification. Create appropriate child nodes and/or leaves:\n\n${content}`
      });

      // Process tool calls in a loop
      let step = 0;
      const maxSteps = 50;

      while (step < maxSteps) {
        step++;

        const functionCalls = response.functionCalls;
        if (!functionCalls || functionCalls.length === 0) {
          // Check if LLM provided text response (maybe it's done or confused)
          if (response.text) {
            console.log(`[gen] LLM response: ${response.text.slice(0, 200)}...`);
          }
          break;
        }

        console.log(`[gen] Step ${step}: ${functionCalls.length} tool call(s)`);

        const functionResponses = [];

        for (const call of functionCalls) {
          let result: { success: boolean; path?: string; error?: string };

          try {
            if (call.name === 'gen_node') {
              result = await this.handleGenNode(call.args as GenNodeArgs, nodeDir, depth);
            } else if (call.name === 'gen_leaf') {
              result = await this.handleGenLeaf(call.args as GenLeafArgs, nodeDir);
            } else {
              result = { success: false, error: `Unknown tool: ${call.name}` };
            }
          } catch (error) {
            result = { success: false, error: String(error) };
          }

          functionResponses.push({
            name: call.name,
            response: result
          });
        }

        // Send responses back to LLM
        response = await chat.sendMessage({
          message: functionResponses.map(fr => ({
            functionResponse: {
              name: fr.name,
              response: fr.response
            }
          }))
        });
      }

      if (step >= maxSteps) {
        console.warn(`[gen] Reached max steps (${maxSteps})`);
      }

    } catch (error) {
      console.error(`[gen] LLM processing failed:`, error);
    }
  }

  /**
   * Handle gen_node tool call - create child node and recurse
   */
  private async handleGenNode(
    args: GenNodeArgs, 
    parentDir: string,
    parentDepth: number
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const { name, content } = args;
    
    if (!name || !content) {
      return { success: false, error: 'gen_node requires name and content' };
    }

    // Validate name (no path traversal)
    if (name.includes('/') || name.includes('..')) {
      return { success: false, error: 'Invalid node name' };
    }

    // Check for suspicious recursion patterns
    const parentName = path.basename(parentDir);
    if (name === parentName || name.includes(parentName) || parentName.includes(name)) {
      console.warn(`[gen] Suspicious recursion: parent=${parentName}, child=${name}`);
      return { success: false, error: `Recursion detected: ${name} is too similar to parent ${parentName}. Use gen_leaf instead.` };
    }

    const childDir = path.join(parentDir, name);
    const childPath = path.join(childDir, 'node.gen.aid');

    // Create directory
    fs.mkdirSync(childDir, { recursive: true });

    // Write child .gen.aid
    fs.writeFileSync(childPath, content, 'utf-8');
    console.log(`[gen] Created node: ${childPath}`);

    // Recursively compile child with incremented depth
    await this.compile(childPath, parentDepth + 1);

    return { success: true, path: childPath };
  }

  /**
   * Handle gen_leaf tool call - create leaf JSON
   */
  private async handleGenLeaf(
    args: GenLeafArgs,
    parentDir: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const { name, prompt, files, commands } = args;

    if (!name || !prompt || !files || files.length === 0) {
      return { success: false, error: 'gen_leaf requires name, prompt, and files' };
    }

    // Validate name
    if (name.includes('/') || name.includes('..')) {
      return { success: false, error: 'Invalid leaf name' };
    }

    const leafDir = path.join(parentDir, name);
    const leafPath = path.join(leafDir, 'leaf.gen.aid.leaf.json');

    // Check for file collisions
    for (const file of files) {
      const absoluteFile = path.join(leafDir, file);
      const existingOwner = this.fileCollisions.get(absoluteFile);
      if (existingOwner) {
        return { 
          success: false, 
          error: `File collision: ${file} already owned by ${existingOwner}` 
        };
      }
      this.fileCollisions.set(absoluteFile, name);
    }

    // Create directory
    fs.mkdirSync(leafDir, { recursive: true });

    // Create leaf JSON
    const leaf: GenLeaf = {
      path: leafPath,
      dir: leafDir,
      prompt,
      files,
      commands: commands || []
    };

    fs.writeFileSync(leafPath, JSON.stringify(leaf, null, 2), 'utf-8');
    console.log(`[gen] Created leaf: ${leafPath}`);

    return { success: true, path: leafPath };
  }
}
