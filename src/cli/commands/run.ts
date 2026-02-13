/**
 * Default compile command
 * Compiles root.aid into .aid-plan/ tree with recursive compilation and parallelization.
 */

import { dirname, join } from "node:path";
import type { CLIOptions, Provider, ChildSpec, RootNode, ChildContext } from "../../types";
import { parseAndResolve } from "../../parser/resolver.js";
import { compileNode, compileRootNode } from "../../compiler/index.js";
import { getProvider, isValidProvider, getSupportedProviders } from "../../providers/index.js";
import { setCallLogger, CallLogger } from "../../providers/call-logger.js";

/**
 * Progress tracking for compilation
 */
interface CompilationState {
  totalNodes: number;
  completedNodes: number;
  currentNodes: Set<string>;
  errors: string[];
  questions: number;
  aiCalls: number;
  /** Maximum nodes allowed (failsafe) */
  maxNodes: number;
  /** Maximum AI calls allowed (failsafe) */
  maxCalls: number;
  /** Whether we hit a limit */
  limitReached: 'nodes' | 'calls' | null;
}

/**
 * Run the compile command
 */
export async function runCommand(options: CLIOptions): Promise<number> {
  const startTime = Date.now();
  
  console.log("AIDef Compilation");
  console.log("=================\n");

  // Parse and resolve the root.aid file
  console.log(`Parsing ${options.rootPath}...`);
  
  const resolved = await parseAndResolve(options.rootPath);
  
  if (resolved.errors.length > 0) {
    console.error("\nParse errors:");
    for (const error of resolved.errors) {
      console.error(`  ${error.location.start.file}:${error.location.start.line}:${error.location.start.column}: ${error.message}`);
    }
    
    // Continue with warnings, abort on errors
    const fatalErrors = resolved.errors.filter(e => e.severity === 'error');
    if (fatalErrors.length > 0) {
      console.error(`\n${fatalErrors.length} fatal error(s). Aborting.`);
      return 1;
    }
  }
  
  if (options.verbose) {
    console.log(`  Imports resolved: ${resolved.imports.size}`);
  }
  
  console.log("  Parse complete.\n");

  // Get the provider - check for explicit provider name or use default
  const providerName = process.env.AID_PROVIDER || process.env.AIDEF_PROVIDER;
  
  let provider: Provider;
  try {
    if (providerName) {
      if (!isValidProvider(providerName)) {
        console.error(`Error: Unknown provider '${providerName}'`);
        console.error(`Supported providers: ${getSupportedProviders().join(', ')}`);
        return 1;
      }
      provider = getProvider(providerName);
    } else {
      // Use default provider based on available API keys
      const { getDefaultProvider } = await import("../../providers/index.js");
      provider = getDefaultProvider();
    }
    console.log(`Using provider: ${provider.name}`);
  } catch (err) {
    console.error(`Error initializing provider: ${err}`);
    return 1;
  }

  // Test connection
  console.log("Testing provider connection...");
  try {
    const connected = await provider.testConnection();
    if (!connected) {
      console.error("Provider connection test failed.");
      console.error("Check your API key and try 'aid --auth' to configure.");
      return 1;
    }
    console.log("  Connection OK.\n");
  } catch (err) {
    console.error(`Provider connection failed: ${err}`);
    console.error("Check your API key (ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY).");
    return 1;
  }

  // Set up call logger
  const outputDir = join(dirname(options.rootPath), ".aid-plan");
  const callLogger = new CallLogger(outputDir);
  setCallLogger(callLogger);

  // Initialize compilation state with limits
  const state: CompilationState = {
    totalNodes: 1, // Start with root
    completedNodes: 0,
    currentNodes: new Set(["root"]),
    errors: [],
    questions: 0,
    aiCalls: 0,
    maxNodes: options.maxNodes,
    maxCalls: options.maxCalls,
    limitReached: null,
  };

  console.log("Starting compilation...");
  console.log(`  Limits: max ${state.maxNodes} nodes, max ${state.maxCalls} AI calls\n`);

  // Compile recursively with parallelization
  // Root receives empty context (no parent)
  try {
    await compileRecursively(
      resolved.ast,
      provider,
      outputDir,
      state,
      options.verbose ?? false
    );
  } catch (err) {
    console.error(`\nCompilation failed: ${err}`);
    return 1;
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n=================");
  
  if (state.limitReached) {
    console.log(`⚠️  Compilation STOPPED - ${state.limitReached} limit reached!`);
    console.log(`  Use --max-${state.limitReached}=N to increase the limit.`);
  } else {
    console.log("Compilation complete!");
  }
  
  console.log(`  Nodes compiled: ${state.completedNodes}/${state.maxNodes}`);
  console.log(`  AI calls: ${state.aiCalls}/${state.maxCalls}`);
  console.log(`  Time: ${elapsed}s`);
  
  if (state.questions > 0) {
    console.log(`  Questions: ${state.questions} (run 'aid --browse' to review)`);
  }
  
  if (state.errors.length > 0) {
    console.log(`  Errors: ${state.errors.length}`);
    if (options.verbose) {
      for (const error of state.errors) {
        console.error(`    - ${error}`);
      }
    }
  }

  console.log(`\nOutput: ${outputDir}/`);
  
  // Return error if limit was reached
  if (state.limitReached) {
    return 1;
  }
  
  return state.errors.length > 0 ? 1 : 0;
}

/**
 * Check if we've hit any limits.
 */
function checkLimits(state: CompilationState): boolean {
  if (state.limitReached) return true;
  
  if (state.completedNodes >= state.maxNodes) {
    state.limitReached = 'nodes';
    return true;
  }
  if (state.aiCalls >= state.maxCalls) {
    state.limitReached = 'calls';
    return true;
  }
  return false;
}

/**
 * Recursively compile nodes with parallel execution of siblings.
 */
async function compileRecursively(
  node: RootNode,
  provider: Provider,
  outputDir: string,
  state: CompilationState,
  verbose: boolean
): Promise<void> {
  // Check limits before starting
  if (checkLimits(state)) return;

  // Compile the root node (uses createRootContext internally)
  state.aiCalls++;
  const result = await compileRootNode(node, provider, outputDir);
  
  state.completedNodes++;
  state.currentNodes.delete(result.nodePath || "root");
  state.errors.push(...result.errors);
  state.questions += result.questions.length;

  if (verbose) {
    const status = result.isLeaf ? "leaf" : `${result.children.length} children`;
    console.log(`  [${state.completedNodes}/${state.totalNodes}] ${result.nodePath || "root"} (${status})`);
  } else {
    // Simple progress indicator
    process.stdout.write(`\r  Compiling... ${state.completedNodes}/${state.totalNodes} nodes`);
  }

  // Check limits after each node
  if (checkLimits(state)) return;

  // If there are children, compile them in parallel
  // Each child already has its context set in ChildSpec.context
  if (result.children.length > 0) {
    state.totalNodes += result.children.length;
    
    // Track current nodes being compiled
    for (const child of result.children) {
      state.currentNodes.add(child.name);
    }

    // Compile children in parallel
    await Promise.all(
      result.children.map((child) =>
        compileChildNode(child, provider, outputDir, state, verbose)
      )
    );
  }
}

/**
 * Compile a child node from a ChildSpec.
 * The child's context is already set in childSpec.context (AI decides what each child gets).
 */
async function compileChildNode(
  childSpec: ChildSpec,
  provider: Provider,
  outputDir: string,
  state: CompilationState,
  verbose: boolean
): Promise<void> {
  // Check limits before processing
  if (checkLimits(state)) return;

  // If child is already marked as a leaf by the AI, don't compile it further
  if (childSpec.isLeaf) {
    // Write the leaf plan file and context
    const { writePlanFile, writeContextFile } = await import("../../compiler/writer.js");
    
    try {
      await writePlanFile(outputDir, childSpec.name, childSpec.spec);
      await writeContextFile(outputDir, childSpec.name, childSpec.context);
    } catch (err) {
      state.errors.push(`Failed to write leaf node ${childSpec.name}: ${err}`);
    }
    
    state.completedNodes++;
    state.currentNodes.delete(childSpec.name);
    
    if (verbose) {
      console.log(`  [${state.completedNodes}/${state.totalNodes}] ${childSpec.name} (leaf - marked by parent)`);
    } else {
      process.stdout.write(`\r  Compiling... ${state.completedNodes}/${state.totalNodes} nodes`);
    }
    
    return;
  }

  // Build a synthetic AST node from the child spec
  const childNode: RootNode = {
    type: "root",
    children: [
      {
        type: "prose",
        content: childSpec.spec,
        source: {
          start: { file: "generated", line: 1, column: 1, offset: 0 },
          end: { file: "generated", line: 1, column: childSpec.spec.length, offset: childSpec.spec.length },
        },
      },
    ],
    source: {
      start: { file: "generated", line: 1, column: 1, offset: 0 },
      end: { file: "generated", line: 1, column: 1, offset: 0 },
    },
  };

  // Check limits before AI call
  if (checkLimits(state)) return;

  // Use the context from ChildSpec (parent already decided what this child receives)
  state.aiCalls++;
  const result = await compileNode(childNode, childSpec.context, provider, outputDir);
  
  state.completedNodes++;
  state.currentNodes.delete(childSpec.name);
  state.errors.push(...result.errors);
  state.questions += result.questions.length;

  if (verbose) {
    const status = result.isLeaf ? "leaf" : `${result.children.length} children`;
    console.log(`  [${state.completedNodes}/${state.totalNodes}] ${result.nodePath} (${status})`);
  } else {
    process.stdout.write(`\r  Compiling... ${state.completedNodes}/${state.totalNodes} nodes`);
  }

  // Check limits after compilation
  if (checkLimits(state)) return;

  // Recursively compile grandchildren
  // Each grandchild's context is in result.children[].context
  if (result.children.length > 0) {
    state.totalNodes += result.children.length;
    
    for (const grandchild of result.children) {
      state.currentNodes.add(grandchild.name);
    }

    await Promise.all(
      result.children.map((grandchild) =>
        compileChildNode(grandchild, provider, outputDir, state, verbose)
      )
    );
  }
}
