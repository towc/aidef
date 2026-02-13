/**
 * Compiler Module
 *
 * Exports for the single-node compilation system.
 */

export {
  compileNode,
  compileRootNode,
  type CompileNodeResult,
  type CompileOptions,
} from "./compile-node.js";

export {
  buildChildContext,
  createRootContext,
  buildNodePath,
} from "./context-builder.js";

export {
  writeAidgFile,
  writeAidcFile,
  writeAidqFile,
  readAidgFile,
  readAidcFile,
  readAidqFile,
} from "./writer.js";

export {
  diffNode,
  addCacheMetadata,
  extractCacheMetadata,
  hashContent,
  hashContext,
  summarizeChanges,
  type DiffResult,
  type CacheMetadata,
} from "./differ.js";
