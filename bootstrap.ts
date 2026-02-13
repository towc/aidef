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

You will receive a .aid file which is a specification for software. Your job is to:
1. Read and understand the specification
2. Read any included files using the read_file tool
3. Generate complete, working code
4. Write the code to src/ using the write_file tool

## .aid File Format

.aid files use a simple nginx-like syntax:
- \`name { }\` defines a module block
- \`include ./path;\` imports another file
- \`#\` starts a comment (everything after # on a line is ignored)
- Everything else is prose (natural language specification)

Example:
\`\`\`
# A simple API
server {
  HTTP server using Bun.serve;
  Port 3000;
  
  routes {
    GET /health returns { ok: true };
  }
}
\`\`\`

## Rules

1. Read the root .aid file first to understand the full specification
2. Use read_file to load any included files
3. Generate TypeScript code unless otherwise specified
4. Write ALL generated files to src/ using write_file
5. Create a complete, working implementation
6. Follow any constraints or requirements in the specification

## Output

Use the write_file tool to create each source file. Common structure:
- src/index.ts - entry point
- src/[module]/... - module implementations

Start by reading and understanding the specification, then generate the code.`;

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
    const maxSteps = 50;
    
    while (stepCount < maxSteps) {
      stepCount++;
      
      // Check for function calls
      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        // No more function calls, we're done
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
          result = await writeFile(call.args.path as string, call.args.content as string);
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
