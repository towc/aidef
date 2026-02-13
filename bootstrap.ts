#!/usr/bin/env bun
/**
 * AIDef Bootstrapper
 * 
 * Minimal CLI that sends .aid files to an LLM with tools for reading
 * referenced files and writing generated code to src/.
 */

import { generateText, tool } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { resolve, dirname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

// =============================================================================
// Provider Setup
// =============================================================================

function getModel() {
  if (process.env.GEMINI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
    return google("gemini-2.5-pro-preview-06-05");
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic("claude-sonnet-4-20250514");
  }
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai("gpt-4o");
  }
  throw new Error("No API key found. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY");
}

// =============================================================================
// Project Root
// =============================================================================

const projectRoot = dirname(resolve(process.argv[2] || "root.aid"));

// =============================================================================
// Tools
// =============================================================================

const readFileTool = tool({
  description: "Read a file from the project. Use this to read .aid files or any other referenced files.",
  parameters: z.object({
    path: z.string().describe("Relative path from project root"),
  }),
  execute: async ({ path }) => {
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
  },
});

const writeFileTool = tool({
  description: "Write a file to src/. Use this to output generated code. Path must start with src/.",
  parameters: z.object({
    path: z.string().describe("Path starting with src/, e.g. src/index.ts"),
    content: z.string().describe("File content to write"),
  }),
  execute: async ({ path, content }) => {
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
  },
});

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
- \`/* */\` and \`//\` are comments
- Everything else is prose (natural language specification)

Example:
\`\`\`
// A simple API
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
  
  console.log("Generating code...\n");
  
  try {
    const result = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      prompt: `Here is the root .aid specification:\n\n${content}\n\nRead any included files, then generate the complete implementation.`,
      tools: {
        read_file: readFileTool,
        write_file: writeFileTool,
      },
      maxSteps: 50,
    });
    
    console.log("\n==================");
    console.log("Generation complete!");
    
    if (result.text) {
      console.log("\nNotes from generator:");
      console.log(result.text);
    }
    
  } catch (err) {
    console.error("\nGeneration failed:", err);
    process.exit(1);
  }
}

main();
