/**
 * Human Compiler
 * 
 * Processes human-written .aid files:
 * 1. Resolves all `include` statements recursively
 * 2. Escapes `#` in non-.aid includes (like markdown)
 * 3. Outputs a single node.gen.aid file with all includes resolved
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AidParser } from './parser';
import { AidNode } from '../types';

export class HumanCompiler {
  private parser: AidParser;
  private visitedPaths: Set<string> = new Set();
  private outputDir: string;

  constructor(outputDir?: string) {
    this.parser = new AidParser();
    this.outputDir = outputDir || process.cwd();
  }

  /**
   * Compile a human .aid file, resolving all includes.
   * Returns the path to the generated node.gen.aid
   */
  async compile(rootPath: string): Promise<string> {
    console.log(`[resolver] Compiling ${rootPath}`);
    
    const absolutePath = path.resolve(rootPath);
    const content = await this.resolveFile(absolutePath);
    
    // Ensure output directory exists
    fs.mkdirSync(this.outputDir, { recursive: true });
    
    // Write to node.gen.aid in output directory
    const outputPath = path.join(this.outputDir, 'node.gen.aid');
    fs.writeFileSync(outputPath, content, 'utf-8');
    
    console.log(`[resolver] Generated ${outputPath}`);
    return outputPath;
  }

  /**
   * Recursively resolve a file, processing includes
   */
  private async resolveFile(filePath: string): Promise<string> {
    // Circular dependency check
    if (this.visitedPaths.has(filePath)) {
      console.warn(`[resolver] Circular include detected: ${filePath}`);
      return `# Circular include: ${filePath}\n`;
    }
    this.visitedPaths.add(filePath);

    // Read file
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error(`[resolver] Failed to read ${filePath}:`, error);
      this.visitedPaths.delete(filePath);
      return `# Failed to include: ${filePath}\n`;
    }

    // Parse and process
    const parsed = this.parser.parse(content);
    const resolvedNodes = await this.resolveNodes(parsed.nodes, path.dirname(filePath));
    
    this.visitedPaths.delete(filePath);
    return this.parser.stringify(resolvedNodes);
  }

  /**
   * Process AST nodes, resolving includes
   */
  private async resolveNodes(nodes: AidNode[], basePath: string): Promise<AidNode[]> {
    const result: AidNode[] = [];

    for (const node of nodes) {
      if (node.type === 'include') {
        // Resolve include
        const resolved = await this.resolveInclude(node.path, basePath);
        result.push(...resolved);
      } else if (node.type === 'module') {
        // Recurse into module
        const resolvedContent = await this.resolveNodes(node.content, basePath);
        result.push({ ...node, content: resolvedContent });
      } else {
        result.push(node);
      }
    }

    return result;
  }

  /**
   * Resolve an include statement
   */
  private async resolveInclude(includePath: string, basePath: string): Promise<AidNode[]> {
    // Handle HTTP includes
    if (includePath.startsWith('http://') || includePath.startsWith('https://')) {
      console.warn(`[resolver] HTTP include not yet supported: ${includePath}`);
      return [{ type: 'prose', text: `# TODO: HTTP include: ${includePath}` }];
    }

    // Resolve relative path
    const absolutePath = path.resolve(basePath, includePath);

    // Check if it's a .aid file
    if (absolutePath.endsWith('.aid')) {
      // Recursively process .aid file
      const content = await this.resolveFile(absolutePath);
      const parsed = this.parser.parse(content);
      return parsed.nodes;
    } else {
      // Non-.aid file: escape # and include as prose
      return this.includeNonAidFile(absolutePath);
    }
  }

  /**
   * Include a non-.aid file (like markdown), escaping # characters
   */
  private includeNonAidFile(filePath: string): AidNode[] {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Escape # at start of lines (markdown headers, etc.)
      const escaped = content
        .split('\n')
        .map(line => line.startsWith('#') ? `\\${line}` : line)
        .join('\n');

      return [
        { type: 'prose', text: '```' },
        { type: 'prose', text: escaped },
        { type: 'prose', text: '```' },
      ];
    } catch (error) {
      console.error(`[resolver] Failed to include non-.aid file ${filePath}:`, error);
      return [{ type: 'prose', text: `# Failed to include: ${filePath}` }];
    }
  }
}
