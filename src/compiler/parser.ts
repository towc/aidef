/**
 * AID Parser
 * 
 * Parses .aid files into an AST. Handles:
 * - `# comments`
 * - `include path;`
 * - `param=value;`
 * - `module { content }`
 * - Prose (everything else)
 */

import { AidNode, AidParam, AidModule, AidInclude, AidProse, ParsedAid } from '../types';

export class AidParser {
  /**
   * Parse .aid content into an AST
   */
  parse(content: string): ParsedAid {
    const lines = content.split('\n');
    const nodes = this.parseLines(lines, 0, lines.length);
    
    // Collect modules and top-level params
    const modules = new Map<string, AidModule>();
    const params = new Map<string, string>();
    
    this.collectModules(nodes, modules);
    for (const node of nodes) {
      if (node.type === 'param') {
        params.set(node.name, node.value);
      }
    }
    
    return { nodes, modules, params };
  }

  private parseLines(lines: string[], start: number, end: number): AidNode[] {
    const nodes: AidNode[] = [];
    let i = start;
    let proseBuffer: string[] = [];

    const flushProse = () => {
      if (proseBuffer.length > 0) {
        const text = proseBuffer.join('\n').trim();
        if (text) {
          nodes.push({ type: 'prose', text });
        }
        proseBuffer = [];
      }
    };

    while (i < end) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines (add to prose buffer for spacing)
      if (trimmed === '') {
        proseBuffer.push('');
        i++;
        continue;
      }

      // Comment - skip entirely
      if (trimmed.startsWith('#')) {
        i++;
        continue;
      }

      // Strip inline comments
      const commentIdx = this.findCommentStart(trimmed);
      const cleanLine = commentIdx >= 0 ? trimmed.slice(0, commentIdx).trim() : trimmed;
      
      if (!cleanLine) {
        i++;
        continue;
      }

      // Include statement: `include path;`
      const includeMatch = cleanLine.match(/^include\s+(.+);$/);
      if (includeMatch) {
        flushProse();
        nodes.push({ type: 'include', path: includeMatch[1].trim() });
        i++;
        continue;
      }

      // Param: `name=value;`
      const paramMatch = cleanLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)=(.+);$/);
      if (paramMatch) {
        flushProse();
        nodes.push({ type: 'param', name: paramMatch[1], value: paramMatch[2].trim() });
        i++;
        continue;
      }

      // Module start: `name {`
      const moduleMatch = cleanLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\{$/);
      if (moduleMatch) {
        flushProse();
        const moduleName = moduleMatch[1];
        
        // Find matching closing brace
        const closeIdx = this.findClosingBrace(lines, i + 1);
        if (closeIdx < 0) {
          throw new Error(`Unclosed module '${moduleName}' starting at line ${i + 1}`);
        }

        // Parse module content recursively
        const moduleContent = this.parseLines(lines, i + 1, closeIdx);
        nodes.push({ type: 'module', name: moduleName, content: moduleContent });
        
        i = closeIdx + 1;
        continue;
      }

      // Check for closing brace (shouldn't happen at this level)
      if (cleanLine === '}') {
        i++;
        continue;
      }

      // Everything else is prose
      proseBuffer.push(line);
      i++;
    }

    flushProse();
    return nodes;
  }

  /**
   * Find where a comment starts in a line, respecting quotes
   */
  private findCommentStart(line: string): number {
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (inString) {
        if (char === stringChar && line[i - 1] !== '\\') {
          inString = false;
        }
      } else {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
        } else if (char === '#') {
          return i;
        }
      }
    }
    
    return -1;
  }

  /**
   * Find the line index of the closing brace matching an opening brace
   */
  private findClosingBrace(lines: string[], start: number): number {
    let depth = 1;
    
    for (let i = start; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      
      // Skip comments
      if (trimmed.startsWith('#')) continue;
      
      // Count braces
      for (const char of trimmed) {
        if (char === '{') depth++;
        if (char === '}') depth--;
        if (depth === 0) return i;
      }
    }
    
    return -1;
  }

  /**
   * Recursively collect all modules into a flat map
   */
  private collectModules(nodes: AidNode[], modules: Map<string, AidModule>): void {
    for (const node of nodes) {
      if (node.type === 'module') {
        modules.set(node.name, node);
        this.collectModules(node.content, modules);
      }
    }
  }

  /**
   * Convert AST back to .aid text
   */
  stringify(nodes: AidNode[], indent = 0): string {
    const pad = '  '.repeat(indent);
    const lines: string[] = [];

    for (const node of nodes) {
      switch (node.type) {
        case 'prose':
          for (const line of node.text.split('\n')) {
            lines.push(pad + line);
          }
          break;
        case 'include':
          lines.push(`${pad}include ${node.path};`);
          break;
        case 'param':
          lines.push(`${pad}${node.name}=${node.value};`);
          break;
        case 'module':
          lines.push(`${pad}${node.name} {`);
          lines.push(this.stringify(node.content, indent + 1));
          lines.push(`${pad}}`);
          break;
      }
    }

    return lines.join('\n');
  }
}
