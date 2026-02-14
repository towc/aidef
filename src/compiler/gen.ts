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
const SYSTEM_PROMPT = `You are an AIDef compiler node. You act as an ARCHITECT for your subtree.

## YOUR ROLE

You receive a .aid specification (abstract prose) and transform it into a concrete execution plan.
You spawn children (nodes or leaves) to implement each module.
You are NOT implementing code - you are PLANNING and DELEGATING.

## .aid SYNTAX

- \`module { content }\` - Named module block
- \`path=value;\` - Parameter on parent module sets base path (children inherit it)
- Plain text - Prose describing what the module should do

## PATH INHERITANCE

If parent has \`path=src/compiler;\` and child is named \`parser\`, the child's output goes to \`src/compiler/parser.ts\` (or \`src/compiler/parser/\` if it's a node with multiple files).

Submodules do NOT repeat the full path - they inherit from parent.

## ARCHITECT RESPONSIBILITIES

1. **Identify modules**: Find all \`module { }\` blocks at your level
2. **Design interfaces**: Transform abstract prose into concrete TypeScript signatures
3. **Spawn children**: For each module, create ONE child (node or leaf)
4. **Pass context**: Each child receives:
   - A CONCRETE prompt with exact TypeScript interfaces to implement
   - Relevant sibling interfaces (what already exists to import from)

## TRANSFORMING PROSE TO CONCRETE INTERFACES

The human .aid is abstract. YOU must design the concrete interfaces.

Example input prose:
  "Exports parse and stringify functions, plus AST node types"

Your leaf prompt should be CONCRETE:
  "Use Bun and TypeScript. Implement:
   - export function parse(content: string): AidNode[]
   - export function stringify(nodes: AidNode[]): string
   - export type AidNode = AidModule | AidParam | AidInclude | AidProse
   - export interface AidModule { type: 'module'; name: string; content: AidNode[] }
   ..."

## PASSING SIBLING CONTEXT

When a child needs to import from a sibling, include the relevant interface.

Example: resolver needs parse() from parser:
  "PRE-EXISTING: Import { parse, AidNode } from '../parser'
   Signature: parse(content: string): AidNode[]"

Only include what the child actually uses.

## CREATING ENTRY POINTS

If a module has submodules but also exports its own interface, create a leaf for the entry point.
Name it based on the export (e.g., "index" for index.ts).

## TOOLS

### gen_node
Use when a module has 2+ nested submodules inside it.
Pass the module's content for the child node to further decompose.

### gen_leaf  
Use when a module is simple enough to implement directly.

The "files" array should contain ONLY filenames (e.g., ["parser.ts", "types.ts"]).
Do NOT include full paths like "src/compiler/parser.ts" - just the filename.
The path= param on the module tells where the file goes, not the files array.

The prompt MUST include:
- "Use Bun and TypeScript"
- CONCRETE TypeScript interfaces (not abstract prose)
- Behavioral requirements
- PRE-EXISTING sibling imports if needed

## RULES

1. **ONE child per module** - Don't create duplicates
2. **Match hierarchy** - Nested modules become nested children
3. **No recursion** - Don't create a child with the same name as yourself
4. **Single pass** - Make all calls in one step, then stop
5. **Be concrete** - Transform abstract prose into specific TypeScript
6. **Files are filenames only** - Not paths, just names like "index.ts"`;

const MAX_DEPTH = 3; // Maximum nesting depth

export class GenCompiler {
  private ai: GoogleGenAI;
  private differ: TreeDiffer;
  private fileCollisions: Map<string, string> = new Map(); // file -> leaf that owns it
  private createdChildren: Map<string, Set<string>> = new Map(); // parentDir -> set of child names

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
        description: 'Create a child node ONLY when a module has 2+ named submodule {} blocks inside it.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { 
              type: Type.STRING, 
              description: 'Exact name from the module { } block in the spec' 
            },
            content: { 
              type: Type.STRING, 
              description: 'The FULL content inside that module { } block, including all nested submodules' 
            }
          },
          required: ['name', 'content']
        }
      },
      {
        name: 'gen_leaf',
        description: 'Create a leaf for code generation. Use for modules without nested submodule {} blocks.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { 
              type: Type.STRING, 
              description: 'Exact name from the module { } block in the spec' 
            },
            outputPath: {
              type: Type.STRING,
              description: 'Output path from path= param, relative to project root (e.g., "src/compiler"). Inherit from parent if not specified in module.'
            },
            sourceAid: {
              type: Type.STRING,
              description: 'Path to the original human .aid file (e.g., "compiler.aid")'
            },
            prompt: { 
              type: Type.STRING, 
              description: 'DETAILED code generation instructions: runtime (Bun/TS), dependencies, exports, types, behavior' 
            },
            files: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Files to create (e.g., ["index.ts", "types.ts"])'
            },
            commands: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Shell commands to run (bun init, bun add, bun install only)'
            }
          },
          required: ['name', 'outputPath', 'sourceAid', 'prompt', 'files']
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
            outputPath: {
              type: Type.STRING,
              description: 'Output path from path= param, relative to project root'
            },
            sourceAid: {
              type: Type.STRING,
              description: 'Path to the original human .aid file'
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
              description: 'Shell commands to run (bun init, bun add, bun install only)'
            }
          },
          required: ['name', 'outputPath', 'sourceAid', 'prompt', 'files']
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

        // Check if any succeeded - if all failed with "already exists", we're done
        const anySucceeded = functionResponses.some(fr => fr.response.success);
        if (!anySucceeded) {
          console.log(`[gen] All calls failed (likely duplicates) - stopping`);
          break;
        }

        // Send responses back to LLM with instruction to stop if done
        response = await chat.sendMessage({
          message: functionResponses.map(fr => ({
            functionResponse: {
              name: fr.name,
              response: {
                ...fr.response,
                note: fr.response.success 
                  ? 'Created successfully. Only make more calls if there are remaining top-level modules.'
                  : 'Failed - do not retry this item.'
              }
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

    // Check if already created
    if (!this.createdChildren.has(parentDir)) {
      this.createdChildren.set(parentDir, new Set());
    }
    if (this.createdChildren.get(parentDir)!.has(name)) {
      return { success: false, error: `Node '${name}' already exists in this directory. Do not create duplicates.` };
    }
    this.createdChildren.get(parentDir)!.add(name);

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
    const { name, outputPath, sourceAid, prompt, files, commands } = args;

    if (!name || !outputPath || !sourceAid || !prompt || !files || files.length === 0) {
      return { success: false, error: 'gen_leaf requires name, outputPath, sourceAid, prompt, and files' };
    }

    // Validate name
    if (name.includes('/') || name.includes('..')) {
      return { success: false, error: 'Invalid leaf name' };
    }

    // Validate outputPath (no ..)
    if (outputPath.includes('..')) {
      return { success: false, error: 'Invalid outputPath' };
    }

    const leafDir = path.join(parentDir, name);
    const leafPath = path.join(leafDir, 'leaf.gen.aid.leaf.json');

    // Check if already created
    if (!this.createdChildren.has(parentDir)) {
      this.createdChildren.set(parentDir, new Set());
    }
    if (this.createdChildren.get(parentDir)!.has(name)) {
      return { success: false, error: `Leaf '${name}' already exists in this directory. Do not create duplicates.` };
    }
    this.createdChildren.get(parentDir)!.add(name);

    // Check for file collisions using outputPath
    for (const file of files) {
      const absoluteFile = path.join(outputPath, file);
      const existingOwner = this.fileCollisions.get(absoluteFile);
      if (existingOwner) {
        return { 
          success: false, 
          error: `File collision: ${file} at ${outputPath} already owned by ${existingOwner}` 
        };
      }
      this.fileCollisions.set(absoluteFile, name);
    }

    // Create directory
    fs.mkdirSync(leafDir, { recursive: true });

    // Create leaf JSON with outputPath and sourceAid
    const leaf: GenLeaf = {
      path: leafPath,
      dir: leafDir,
      outputPath,
      sourceAid,
      prompt,
      files,
      commands: commands || []
    };

    fs.writeFileSync(leafPath, JSON.stringify(leaf, null, 2), 'utf-8');
    console.log(`[gen] Created leaf: ${leafPath} -> ${outputPath}`);

    return { success: true, path: leafPath };
  }
}
