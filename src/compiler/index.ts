/**
 * Compiler Module
 *
 * Exports for the compilation system.
 */

export {
  compileNode,
  compileRootNode,
  type CompileNodeResult,
  type CompileOptions,
} from "./compile-node.js";

export {
  createRootContext,
  buildNodePath,
  mergeContexts,
  isEmptyContext,
  formatContext,
} from "./context-builder.js";

export {
  writePlanFile,
  writeQuestionsFile,
  writeContextFile,
  readPlanFile,
  readQuestionsFile,
  readContextFile,
} from "./writer.js";

export {
  diffNode,
  createCacheMetadata,
  hashContent,
  hashContext,
  summarizeChanges,
  type DiffResult,
  type CacheMetadata,
} from "./differ.js";

export {
  SourceMapBuilder,
  serializeSourceMap,
  parseSourceMap,
  writeSourceMap,
  readSourceMap,
  lookupSourceLocation,
  getContributingSources,
} from "./source-map.js";
