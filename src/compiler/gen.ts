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
const SYSTEM_PROMPT = `You are the AIDef compiler. You process .aid specifications and break them into smaller pieces.

## Your Tools

1. **gen_node**: Create a child node for complex sub-tasks that need further breakdown.
   - Must define an INTERFACE: what files it creates and what it exports
   - The child will implement this interface
   - Use for modules, services, features that have multiple parts

2. **gen_leaf**: Create a leaf node for atomic implementation tasks.
   - Must be specific enough for direct code generation
   - Include exact file paths and what each should contain
   - Include interface signatures, types, expected behavior
   - This is what a junior dev could implement without questions

## Rules

1. ALWAYS define interfaces before spawning children
2. Each child owns its own folder - no shared files between siblings
3. Be specific in leaf prompts - include type signatures, function names, behavior
4. A leaf's 'files' array must list ALL files it will create
5. Only use whitelisted commands: npm init, npm install, bun install, bun add

## When to use gen_node vs gen_leaf

- gen_node: "Build a REST API server" (needs breakdown: routes, middleware, db, etc.)
- gen_leaf: "Create src/utils/hash.ts with function sha256(input: string): string" (atomic)

## Interface Format

When calling gen_node, the 'interface' field should specify:
- files: ["src/index.ts", "src/types.ts"] - files this node will create
- exports: {"src/index.ts": ["main", "Config"], "src/types.ts": ["UserType"]} - what each file exports

This lets siblings import from each other via the parent-defined interface.`;

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
  async compile(genAidPath: string): Promise<void> {
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

    // Process with LLM
    await this.processWithLLM(content, nodeDir);

    // Save for future diffing
    this.differ.savePrevious(genAidPath, content);
  }

  /**
   * Use LLM to process the .aid content and generate children
   */
  private async processWithLLM(content: string, nodeDir: string): Promise<void> {
    const tools = [
      {
        name: 'gen_node',
        description: 'Create a child node for a complex sub-task. Must define interface.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { 
              type: Type.STRING, 
              description: 'Name of the child node (becomes folder name)' 
            },
            interface: {
              type: Type.OBJECT,
              description: 'Interface this node provides to siblings',
              properties: {
                files: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Files this node will create'
                },
                exports: {
                  type: Type.OBJECT,
                  description: 'Map of file path to exported names'
                }
              },
              required: ['files']
            },
            content: { 
              type: Type.STRING, 
              description: 'The .aid specification for this child' 
            }
          },
          required: ['name', 'interface', 'content']
        }
      },
      {
        name: 'gen_leaf',
        description: 'Create a leaf node for an atomic implementation task.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { 
              type: Type.STRING, 
              description: 'Name of the leaf (becomes folder name)' 
            },
            prompt: { 
              type: Type.STRING, 
              description: 'Detailed implementation instructions including interfaces' 
            },
            files: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Files this leaf will create (relative paths)'
            },
            commands: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Shell commands to run (must be whitelisted)'
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
              result = await this.handleGenNode(call.args as GenNodeArgs, nodeDir);
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
    parentDir: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const { name, content } = args;
    
    if (!name || !content) {
      return { success: false, error: 'gen_node requires name and content' };
    }

    // Validate name (no path traversal)
    if (name.includes('/') || name.includes('..')) {
      return { success: false, error: 'Invalid node name' };
    }

    const childDir = path.join(parentDir, name);
    const childPath = path.join(childDir, 'node.gen.aid');

    // Create directory
    fs.mkdirSync(childDir, { recursive: true });

    // Write child .gen.aid
    fs.writeFileSync(childPath, content, 'utf-8');
    console.log(`[gen] Created node: ${childPath}`);

    // Recursively compile child
    await this.compile(childPath);

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
