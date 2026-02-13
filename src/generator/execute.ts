/**
 * Generator Executor
 *
 * Executes leaf nodes (generators) to produce code files.
 */

import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type {
  Provider,
  GenerateResult,
  GeneratedFile,
  ChildContext,
  NodeQuestions,
} from "../types/index.js";
import { readPlanFile, readContextFile, writeQuestionsFile } from "../compiler/writer.js";
import { EMPTY_CONTEXT } from "../types/index.js";

/**
 * Result of executing a single generator node.
 */
export interface ExecuteResult {
  /** The node path that was executed */
  nodePath: string;
  /** Files that were generated */
  files: GeneratedFile[];
  /** Questions raised during generation */
  questions: NodeQuestions["questions"];
  /** Non-blocking considerations */
  considerations: NodeQuestions["considerations"];
  /** Errors encountered */
  errors: string[];
  /** Whether execution was successful */
  success: boolean;
}

/**
 * Options for generator execution.
 */
export interface ExecuteOptions {
  /** Whether to log progress */
  verbose?: boolean;
  /** Whether to add source comment headers to generated files */
  addSourceHeaders?: boolean;
}

/**
 * Execute a single generator node.
 *
 * Reads the node's spec and context from .aid-plan/, calls the provider
 * to generate code, and writes files to build/.
 *
 * @param nodePath - The node path (e.g., "server/api/users")
 * @param provider - The AI provider to use
 * @param aidPlanDir - The .aid-plan/ directory
 * @param buildDir - The build/ output directory
 * @param options - Execution options
 */
export async function executeGenerator(
  nodePath: string,
  provider: Provider,
  aidPlanDir: string,
  buildDir: string,
  options: ExecuteOptions = {}
): Promise<ExecuteResult> {
  const { verbose = false, addSourceHeaders = true } = options;
  const errors: string[] = [];

  // Read the spec
  const spec = await readPlanFile(aidPlanDir, nodePath);
  if (!spec) {
    return {
      nodePath,
      files: [],
      questions: [],
      considerations: [],
      errors: [`No .plan.aid file found for ${nodePath}`],
      success: false,
    };
  }

  // Read the context (should exist for leaf nodes)
  const context = await readContextFile(aidPlanDir, nodePath) ?? EMPTY_CONTEXT;

  if (verbose) {
    console.log(`  [generate] ${nodePath}`);
  }

  // Call the provider to generate code
  let result: GenerateResult;
  try {
    result = await provider.generate({
      spec,
      context,
      nodePath,
    });
  } catch (err) {
    return {
      nodePath,
      files: [],
      questions: [],
      considerations: [],
      errors: [`Provider generation failed for ${nodePath}: ${err}`],
      success: false,
    };
  }

  // Write generated files to build/
  const writtenFiles: GeneratedFile[] = [];
  for (const file of result.files) {
    try {
      let content = file.content;

      // Add source header for traceability
      if (addSourceHeaders) {
        content = addSourceHeader(content, file.path, nodePath);
      }

      const filePath = join(buildDir, file.path);
      await ensureDir(dirname(filePath));
      await Bun.write(filePath, content);

      writtenFiles.push({ path: file.path, content });

      if (verbose) {
        console.log(`    -> ${file.path}`);
      }
    } catch (err) {
      errors.push(`Failed to write ${file.path}: ${err}`);
    }
  }

  // Write questions file if there are questions or considerations
  if (result.questions.length > 0 || result.considerations.length > 0) {
    try {
      await writeQuestionsFile(aidPlanDir, nodePath, {
        module: nodePath,
        questions: result.questions,
        considerations: result.considerations,
      });
    } catch (err) {
      errors.push(`Failed to write questions for ${nodePath}: ${err}`);
    }
  }

  return {
    nodePath,
    files: writtenFiles,
    questions: result.questions,
    considerations: result.considerations,
    errors,
    success: errors.length === 0,
  };
}

/**
 * Add a source header comment to a generated file.
 */
function addSourceHeader(
  content: string,
  filePath: string,
  nodePath: string
): string {
  const ext = filePath.split(".").pop()?.toLowerCase();

  // Determine comment style based on file extension
  let commentStart: string;
  let commentEnd: string;

  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "css":
    case "scss":
    case "less":
    case "java":
    case "c":
    case "cpp":
    case "h":
    case "hpp":
    case "go":
    case "rs":
    case "swift":
    case "kt":
      commentStart = "/**";
      commentEnd = " */";
      break;
    case "py":
    case "rb":
    case "sh":
    case "bash":
    case "zsh":
    case "yaml":
    case "yml":
    case "toml":
      commentStart = "#";
      commentEnd = "";
      break;
    case "html":
    case "xml":
    case "svg":
      commentStart = "<!--";
      commentEnd = " -->";
      break;
    case "sql":
      commentStart = "--";
      commentEnd = "";
      break;
    default:
      // Skip header for unknown file types
      return content;
  }

  const header =
    commentStart === "#" || commentStart === "--"
      ? `${commentStart} Generated by AIDef from: ${nodePath}\n${commentStart} DO NOT EDIT - changes will be overwritten\n\n`
      : `${commentStart}\n * Generated by AIDef from: ${nodePath}\n * DO NOT EDIT - changes will be overwritten\n${commentEnd}\n\n`;

  return header + content;
}

/**
 * Ensure a directory exists.
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}
