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

If parent has \`path=src/compiler;\` and child is named \`parser\`:
- The child's outputPath is ALSO \`src/compiler\` (it inherits from parent)
- The child creates file(s) like \`parser.ts\` in that directory

Submodules inherit the SAME outputPath as parent. Do NOT create subdirectories like \`src/compiler/parser/\`.
All siblings output to the same directory. Use different filenames to distinguish them.

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

## CRITICAL: DO NOT DIVERGE FROM PARENT INSTRUCTIONS

When the spec contains SPECIFIC details (package names, API patterns, function signatures, code blocks), you MUST preserve them EXACTLY in child prompts. Do NOT substitute similar alternatives.

- If spec says "@google/genai" -> use "@google/genai", NOT "@google/generative-ai"
- If spec shows "GoogleGenAI" -> use "GoogleGenAI", NEVER "GoogleGenerativeAI"
- The class name is GoogleGenAI (two capital letters: GenAI), NOT GoogleGenerativeAI
- If spec shows \`new GoogleGenAI({ apiKey })\` -> use that exact pattern
- If spec shows \`ai.chats.create\` -> use that, NOT \`getGenerativeModel\`
- Code blocks in the spec are AUTHORITATIVE - copy them verbatim into leaf prompts
- WRONG: GoogleGenerativeAI, CORRECT: GoogleGenAI

You are passing instructions DOWN the tree. Children cannot see the original spec - they only see what you give them. If you change or omit details, they are lost forever.

## PASSING SIBLING CONTEXT

When a child needs to import from a sibling, include the FULL interface definitions.

Example: resolver needs parse() from parser:
  "PRE-EXISTING: Import { parse, AidNode, AidInclude, AidModule, AidParam, AidProse } from './parser'
   
   Type definitions:
   type AidNode = AidModule | AidParam | AidInclude | AidProse;
   interface AidInclude { type: 'include'; path: string; }
   interface AidModule { type: 'module'; name: string; content: AidNode[]; }
   ...
   
   Function: parse(content: string): AidNode[]"

Include ALL type definitions the child will need to use. If they're accessing fields like \`node.path\`, they need to know the interface has a \`path\` field.

## CREATING ENTRY POINTS

If a module has submodules but also has prose describing exports (like "Exports a run function..."), 
create a leaf named "index" for that entry point. This creates index.ts in the module's outputPath.

IMPORTANT: Never name a leaf the same as its parent module. Use "index" instead.

## TOOLS

### gen_leaf (DEFAULT - use this most of the time)
Use when a module should generate code directly.
If a module has NO nested \`name { }\` blocks inside it, you MUST use gen_leaf.
Most modules are leaves - they describe what code to generate.

### gen_node (RARE - only for complex hierarchies)
Use ONLY when a module has 2+ nested \`name { }\` blocks inside it.
If a module only has prose/text and NO nested blocks, use gen_leaf instead.
Pass the module's content for the child node to further decompose.

The "files" array should contain ONLY filenames (e.g., ["parser.ts", "types.ts"]).
Do NOT include full paths like "src/compiler/parser.ts" - just the filename.
The path= param on the module tells where the file goes, not the files array.

The prompt MUST include:
- "Use Bun and TypeScript"
- CONCRETE TypeScript interfaces (not abstract prose)
- Behavioral requirements
- PRE-EXISTING sibling imports if needed

IMPORTANT: The prompt should NOT mention full paths like "Create src/compiler/index.ts".
The outputPath already specifies where files go. Just describe what the file should contain.
Example: Instead of "Create src/compiler/index.ts which exports...", say "Create index.ts which exports..."

## CRITICAL: ALWAYS CREATE SOMETHING

If you receive content with NO nested \`name { }\` blocks, you MUST create a gen_leaf for it.
Never leave a module without creating either a gen_node or gen_leaf.

## RULES

1. **ONE child per module** - Don't create duplicates
2. **Match hierarchy** - Nested \`name { }\` blocks become gen_node children
3. **No recursion** - Don't create a child with the same name as yourself
4. **Entry points** - If module prose describes exports but also has submodules, create a leaf named "index" for the entry point
5. **ALL CHILDREN IN ONE PASS** - Create ALL children for ALL direct modules in your FIRST batch of tool calls.
   Do NOT wait for a second round. If you have 4 modules, make 4 tool calls in Step 1.
   After the first batch, STOP. Do not make more tool calls.
6. **Be concrete** - Transform abstract prose into specific TypeScript
7. **Files are filenames only** - Not paths, just names like "index.ts"
8. **DIRECT CHILDREN ONLY** - Only create children for modules DIRECTLY nested at the top level of your spec.
   Do NOT create children for deeply nested modules (modules inside other modules).
   If you see \`A { B { C } }\`, only create a child for A. A will handle B, and B will handle C.
   This is CRITICAL for proper encapsulation.`;

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
    const createdAny = await this.processWithLLM(content, nodeDir, depth);

    // If LLM didn't create any children, force a leaf creation for this content
    if (!createdAny) {
      console.log(`[gen] No children created for ${nodeDir}, auto-creating leaf`);
      await this.autoCreateLeaf(content, nodeDir);
    }

    // Save for future diffing
    this.differ.savePrevious(genAidPath, content);
  }

  /**
   * Use LLM to process the .aid content and generate children
   * @returns true if any children were created, false otherwise
   */
  private async processWithLLM(content: string, nodeDir: string, depth: number): Promise<boolean> {
    let createdAny = false;
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
              description: 'Output path inherited from parent path= param (e.g., "src/compiler"). Do NOT add subdirectories. All siblings use the same outputPath.'
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
        if (anySucceeded) {
          createdAny = true;
        }
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

    return createdAny;
  }

  /**
   * Auto-create a leaf when the LLM doesn't create any children.
   * This happens when a node has no submodules but LLM didn't realize it should be a leaf.
   */
  private async autoCreateLeaf(content: string, nodeDir: string): Promise<void> {
    // Extract useful info from the content
    const name = path.basename(nodeDir);
    
    // Try to find path= param in content
    const pathMatch = content.match(/path=([^;\s]+)/);
    const outputPath = pathMatch ? pathMatch[1] : 'src';
    
    // Try to find sourceAid - look for common patterns or default to the node name
    const sourceAid = `${name}.aid`;
    
    // Use the content as the prompt, adding concrete requirements
    const prompt = `Use Bun and TypeScript.

Based on the following specification, implement the required functionality:

${content}

Export all public interfaces and functions as described.`;

    // Default to a single file named after the module
    const files = [`${name}.ts`];

    const leafDir = path.join(nodeDir, 'auto');
    const leafPath = path.join(leafDir, 'leaf.gen.aid.leaf.json');

    fs.mkdirSync(leafDir, { recursive: true });

    const leaf: GenLeaf = {
      path: leafPath,
      dir: leafDir,
      outputPath,
      sourceAid,
      prompt,
      files,
      commands: []
    };

    fs.writeFileSync(leafPath, JSON.stringify(leaf, null, 2), 'utf-8');
    console.log(`[gen] Auto-created leaf: ${leafPath} -> ${outputPath}/${files[0]}`);
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
