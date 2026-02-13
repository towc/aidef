/**
 * Default compile command
 * Compiles root.aid into .aid-gen/ tree with recursive compilation and parallelization.
 */

import { dirname, join } from "node:path";
import type { CLIOptions, Provider, ChildSpec, RootNode } from "../../types";
import { parseAndResolve } from "../../parser/resolver.js";
import { compileNode, createRootContext } from "../../compiler/index.js";
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

  // Get the provider
  const providerName = process.env.AID_PROVIDER || process.env.AIDEF_PROVIDER || 'anthropic';
  
  if (!isValidProvider(providerName)) {
    console.error(`Error: Unknown provider '${providerName}'`);
    console.error(`Supported providers: ${getSupportedProviders().join(', ')}`);
    return 1;
  }
  
  let provider: Provider;
  try {
    provider = getProvider(providerName);
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
    console.error("Check your API key (ANTHROPIC_API_KEY or OPENAI_API_KEY).");
    return 1;
  }

  // Set up call logger
  const outputDir = join(dirname(options.rootPath), ".aid-gen");
  const callLogger = new CallLogger(outputDir);
  setCallLogger(callLogger);

  // Initialize compilation state
  const state: CompilationState = {
    totalNodes: 1, // Start with root
    completedNodes: 0,
    currentNodes: new Set(["root"]),
    errors: [],
    questions: 0,
  };

  console.log("Starting compilation...\n");

  // Create root context
  const rootContext = createRootContext(resolved.ast);

  // Compile recursively with parallelization
  try {
    await compileRecursively(
      resolved.ast,
      rootContext,
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
  console.log("Compilation complete!");
  console.log(`  Nodes compiled: ${state.completedNodes}`);
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
    return 1;
  }

  console.log(`\nOutput: ${outputDir}/`);
  return 0;
}

/**
 * Recursively compile nodes with parallel execution of siblings.
 */
async function compileRecursively(
  node: RootNode,
  context: typeof import("../../types").NodeContext.prototype,
  provider: Provider,
  outputDir: string,
  state: CompilationState,
  verbose: boolean
): Promise<void> {
  // Compile the current node
  const result = await compileNode(node, context, provider, outputDir);
  
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

  // If there are children, compile them in parallel
  if (result.children.length > 0) {
    state.totalNodes += result.children.length;
    
    // Track current nodes being compiled
    for (const child of result.children) {
      state.currentNodes.add(child.name);
    }

    // Compile children in parallel
    await Promise.all(
      result.children.map((child) =>
        compileChildNode(child, context, result, provider, outputDir, state, verbose)
      )
    );
  }
}

/**
 * Compile a child node from a ChildSpec.
 */
async function compileChildNode(
  childSpec: ChildSpec,
  parentContext: typeof import("../../types").NodeContext.prototype,
  parentResult: Awaited<ReturnType<typeof compileNode>>,
  provider: Provider,
  outputDir: string,
  state: CompilationState,
  verbose: boolean
): Promise<void> {
  // Build a synthetic AST node from the child spec
  const childNode: RootNode = {
    type: "root",
    children: [
      {
        type: "prose",
        content: childSpec.spec,
        important: false,
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

  // Build child context
  const childContext = {
    ...parentContext,
    module: childSpec.name,
    ancestry: [...parentContext.ancestry, childSpec.name],
    tags: [...new Set([...parentContext.tags, ...childSpec.tags])],
  };

  // Compile the child
  const result = await compileNode(childNode, childContext, provider, outputDir);
  
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

  // Recursively compile grandchildren
  if (result.children.length > 0) {
    state.totalNodes += result.children.length;
    
    for (const grandchild of result.children) {
      state.currentNodes.add(grandchild.name);
    }

    await Promise.all(
      result.children.map((grandchild) =>
        compileChildNode(grandchild, childContext, result, provider, outputDir, state, verbose)
      )
    );
  }
}
