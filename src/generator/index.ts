/**
 * Generator Module
 *
 * Exports for the code generation (build) system.
 */

export {
  executeGenerator,
  type ExecuteResult,
  type ExecuteOptions,
} from "./execute.js";

export {
  discoverLeafNodes,
  type LeafNode,
} from "./discover.js";

export {
  runBuild,
  type BuildResult,
  type BuildOptions,
} from "./build.js";
