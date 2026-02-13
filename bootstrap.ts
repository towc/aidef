#!/usr/bin/env bun
/**
 * AIDef Bootstrapper
 * 
 * Minimal CLI that sends .aid files to an LLM with tools for reading
 * referenced files and writing generated code to src/.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { resolve, dirname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

// =============================================================================
// Project Root
// =============================================================================

const projectRoot = dirname(resolve(process.argv[2] || "root.aid"));

// =============================================================================
// Tools
// =============================================================================

async function readFile(path: string): Promise<{ content?: string; error?: string }> {
  const fullPath = join(projectRoot, path);
  console.log(`  [read] ${path}`);
  
  try {
    const file = Bun.file(fullPath);
    if (!await file.exists()) {
      return { error: `File not found: ${path}` };
    }
    const content = await file.text();
    return { content };
  } catch (err) {
    return { error: `Failed to read ${path}: ${err}` };
  }
}

async function writeFile(path: string, content: string): Promise<{ success?: boolean; path?: string; error?: string }> {
  // Security: only allow writing to src/
  if (!path.startsWith("src/")) {
    return { error: `Cannot write to ${path}: path must start with src/` };
  }
  
  const fullPath = join(projectRoot, path);
  console.log(`  [write] ${path}`);
  
  try {
    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    await Bun.write(fullPath, content);
    return { success: true, path };
  } catch (err) {
    return { error: `Failed to write ${path}: ${err}` };
  }
}

// Tool declarations for Gemini
const tools = [
  {
    name: "read_file",
    description: "Read a file from the project. Use this to read .aid files or any other referenced files.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Relative path from project root"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file", 
    description: "Write a file to src/. Use this to output generated code. Path must start with src/.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Path starting with src/, e.g. src/index.ts"
        },
        content: {
          type: Type.STRING,
          description: "File content to write"
        }
      },
      required: ["path", "content"]
    }
  }
];

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are an AI code generator for the AIDef system.

## Your Task

You will receive a .aid file which is a specification for a BUILD TOOL. Your job is to:
1. Read and understand the FULL specification (read ALL included files)
2. Generate a COMPLETE, FULLY WORKING implementation
3. Write the code to src/ using the write_file tool

## CRITICAL: This is a self-hosting compiler

The specification describes AIDef - a tool that compiles .aid files into code using AI.
You must implement ALL features described, including:

1. **Parser**: Parse .aid syntax (modules, includes, params, comments)
2. **Human mode compiler**: Resolve includes, generate node.gen.aid entry point  
3. **Gen mode compiler**: Use LLM (Google Gemini) to process .gen.aid files, spawn children via gen_node/gen_leaf tools
4. **Tree diffing**: Compare new vs old .gen.aid to skip unchanged branches
5. **Runtime**: Collect leaf nodes, execute them in parallel, run whitelisted commands
6. **CLI**: compile, run, analyse, browse commands

You MUST use @google/genai for LLM calls (already installed).
You MUST implement the gen_node and gen_leaf tools that nodes use to spawn children.
You MUST implement tree diffing to avoid regenerating unchanged nodes.

## .aid File Format

- \`name { }\` defines a module block
- \`include ./path;\` imports another file  
- \`#\` starts a comment
- \`param=value;\` defines parameters
- Everything else is prose

## Rules

1. Read ALL .aid files via read_file before generating code
2. Generate TypeScript for Bun runtime
3. Implement EVERY feature in the specification - no stubs or TODOs
4. The tool must be able to compile itself when run on its own root.aid

## Output Structure

- src/index.ts - CLI entry point
- src/compiler/parser.ts - .aid parser
- src/compiler/human.ts - human mode (resolve includes)
- src/compiler/gen.ts - gen mode (LLM processing with gen_node/gen_leaf)
- src/compiler/diff.ts - tree diffing logic
- src/runtime/index.ts - runtime execution
- src/utils/ - shared utilities

Generate ALL files needed for a complete, working implementation.`;

// =============================================================================
// Main
// =============================================================================

async function main() {
  const aidFile = process.argv[2] || "root.aid";
  const fullPath = resolve(aidFile);
  
  console.log("AIDef Bootstrapper");
  console.log("==================");
  console.log(`Input: ${fullPath}`);
  console.log();
  
  // Read the root .aid file
  const file = Bun.file(fullPath);
  if (!await file.exists()) {
    console.error(`Error: ${aidFile} not found`);
    process.exit(1);
  }
  
  const content = await file.text();
  
  if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY not set");
    process.exit(1);
  }
  
  console.log("Using Google Gemini");
  console.log("Generating code...\n");
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: tools }],
      }
    });
    
    let response = await chat.sendMessage({
      message: `Here is the root .aid specification:\n\n${content}\n\nRead any included files, then generate the complete implementation.`
    });
    
    let stepCount = 0;
    const maxSteps = 100;
    const requiredFiles = [
      'src/index.ts',
      'src/compiler/parser.ts', 
      'src/compiler/human.ts',
      'src/compiler/gen.ts',
      'src/compiler/diff.ts',
      'src/runtime/index.ts',
    ];
    const writtenFiles = new Set<string>();
    
    while (stepCount < maxSteps) {
      stepCount++;
      
      // Check for function calls
      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        // Check if we have all required files
        const missingFiles = requiredFiles.filter(f => !writtenFiles.has(f));
        if (missingFiles.length > 0) {
          console.log(`\n  [continuing] Missing files: ${missingFiles.join(', ')}`);
          response = await chat.sendMessage({
            message: `You stopped before completing the implementation. You still need to generate these files: ${missingFiles.join(', ')}. Continue generating the remaining files.`
          });
          continue;
        }
        break;
      }
      
      console.log(`  [step ${stepCount}] ${functionCalls.length} tool call(s)`);
      
      // Execute each function call
      const functionResponses = [];
      for (const call of functionCalls) {
        let result;
        if (call.name === "read_file") {
          result = await readFile(call.args.path as string);
        } else if (call.name === "write_file") {
          const path = call.args.path as string;
          writtenFiles.add(path);
          result = await writeFile(path, call.args.content as string);
        } else {
          result = { error: `Unknown function: ${call.name}` };
        }
        
        functionResponses.push({
          name: call.name,
          response: result
        });
      }
      
      // Send function responses back
      response = await chat.sendMessage({
        message: functionResponses.map(fr => ({
          functionResponse: {
            name: fr.name,
            response: fr.response
          }
        }))
      });
    }
    
    console.log("\n==================");
    console.log("Generation complete!");
    console.log(`Steps taken: ${stepCount}`);
    console.log(`Files written: ${Array.from(writtenFiles).join(', ')}`);
    
    if (response.text) {
      console.log("\nFinal response from generator:");
      console.log(response.text);
    }
    
  } catch (err) {
    console.error("\nGeneration failed:", err);
    process.exit(1);
  }
}

main();
