/**
 * Source Map Support
 *
 * Generates .plan.aid.map files for traceability.
 * Follows a simplified version of the JS source map format.
 */

import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type { SourceMap, SourceMapping, SourceRange } from "../types/index.js";

/**
 * Builder for creating source maps incrementally.
 */
export class SourceMapBuilder {
  private file: string;
  private sources: string[] = [];
  private sourceIndexMap: Map<string, number> = new Map();
  private mappings: SourceMapping[] = [];

  constructor(outputFile: string) {
    this.file = outputFile;
  }

  /**
   * Add a source file if not already present.
   * Returns the index into the sources array.
   */
  private addSource(sourcePath: string): number {
    let index = this.sourceIndexMap.get(sourcePath);
    if (index === undefined) {
      index = this.sources.length;
      this.sources.push(sourcePath);
      this.sourceIndexMap.set(sourcePath, index);
    }
    return index;
  }

  /**
   * Add a mapping from generated line to source location.
   */
  addMapping(generatedLine: number, sourceFile: string, sourceLine: number): void {
    const sourceIndex = this.addSource(sourceFile);
    this.mappings.push({
      generatedLine,
      sourceIndex,
      sourceLine,
    });
  }

  /**
   * Add mappings for a range of lines from a source range.
   */
  addRangeMapping(
    generatedStartLine: number,
    generatedEndLine: number,
    source: SourceRange
  ): void {
    const sourceIndex = this.addSource(source.start.file);
    const sourceStartLine = source.start.line;
    
    for (let i = 0; i <= generatedEndLine - generatedStartLine; i++) {
      this.mappings.push({
        generatedLine: generatedStartLine + i,
        sourceIndex,
        sourceLine: sourceStartLine + i,
      });
    }
  }

  /**
   * Build the final source map object.
   */
  build(): SourceMap {
    // Sort mappings by generated line
    this.mappings.sort((a, b) => a.generatedLine - b.generatedLine);
    
    return {
      version: 3,
      file: this.file,
      sources: this.sources,
      mappings: this.mappings,
    };
  }
}

/**
 * Serialize a source map to JSON.
 */
export function serializeSourceMap(map: SourceMap): string {
  return JSON.stringify(map, null, 2);
}

/**
 * Parse a source map from JSON.
 */
export function parseSourceMap(content: string): SourceMap {
  return JSON.parse(content) as SourceMap;
}

/**
 * Write a source map file.
 */
export async function writeSourceMap(
  outputDir: string,
  nodePath: string,
  sourceMap: SourceMap
): Promise<void> {
  const filePath = getSourceMapPath(outputDir, nodePath);
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, serializeSourceMap(sourceMap));
}

/**
 * Read a source map file.
 */
export async function readSourceMap(
  outputDir: string,
  nodePath: string
): Promise<SourceMap | null> {
  const filePath = getSourceMapPath(outputDir, nodePath);
  const file = Bun.file(filePath);
  
  if (!(await file.exists())) {
    return null;
  }
  
  const content = await file.text();
  return parseSourceMap(content);
}

/**
 * Get the path for a source map file (.plan.aid.map).
 */
function getSourceMapPath(outputDir: string, nodePath: string): string {
  if (nodePath === "root") {
    return join(outputDir, "root.plan.aid.map");
  }
  return join(outputDir, nodePath, "node.plan.aid.map");
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

/**
 * Look up the original source location for a generated line.
 */
export function lookupSourceLocation(
  sourceMap: SourceMap,
  generatedLine: number
): { file: string; line: number } | null {
  // Binary search for the mapping
  const mapping = sourceMap.mappings.find(m => m.generatedLine === generatedLine);
  
  if (!mapping) {
    return null;
  }
  
  return {
    file: sourceMap.sources[mapping.sourceIndex],
    line: mapping.sourceLine,
  };
}

/**
 * Get all original files that contributed to a generated file.
 */
export function getContributingSources(sourceMap: SourceMap): string[] {
  return [...sourceMap.sources];
}
