// parser.ts

import { AidNode, AidModule, AidParam, AidInclude, AidProse } from './aidTypes';

/**
 * Mock function for fetching file content.
 * In a real scenario, this would be an asynchronous operation
 * fetching from a file system (for local paths) or network (for HTTPS links).
 * For this exercise, it simulates fetching predefined content.
 *
 * @param path The path to the file (e.g., 'test.aid', 'https://example.com/remote.aid').
 * @returns The content of the file as a string, or null if not found.
 */
const fetchFileContent = (path: string): string | null => {
  // --- MOCK IMPLEMENTATION START ---
  if (path === 'test.aid') {
    return `
      # This is a test aid file
      param1=value1;
      include sub.aid;
      module TestModule {
        param2=value2;
      }
      # Another comment
      prose line here.
    `;
  } else if (path === 'sub.aid') {
    return `
      subParam=subValue;
      # This is a comment in sub.aid
      include markdown.md;
    `;
  } else if (path === 'markdown.md') {
    return `
      # Markdown Title
      This is some **markdown** content.
      It should be treated as prose.
      A line with # a hash.
      A line with \# an escaped hash.
    `;
  } else if (path === 'gen.aid') {
    return `
      # This is a .gen.aid file
      include test.aid; # This should trigger a warning
      param_gen=value_gen;
    `;
  }
  // --- MOCK IMPLEMENTATION END ---
  return null; // File not found
};

/**
 * Parses the content of an .aid file into a list of AidNodes.
 *
 * @param content The string content of the .aid file.
 * @param filePath The path of the file being parsed, used for context (e.g., .gen.aid warnings).
 * @returns An array of AidNode representing the parsed structure.
 */
export function parse(content: string, filePath: string = 'unknown.aid'): AidNode[] {
  const nodes: AidNode[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    let processedLine = lines[i];
    let commentStart = -1;

    // Find the start of a non-escaped comment
    for (let j = 0; j < processedLine.length; j++) {
      if (processedLine[j] === '#') {
        if (j > 0 && processedLine[j - 1] === '\\') {
          // Escaped hash, not a comment
          continue;
        } else {
          commentStart = j;
          break;
        }
      }
    }

    if (commentStart !== -1) {
      processedLine = processedLine.substring(0, commentStart);
    }
    let line = processedLine.trim();

    if (line.length === 0) {
      i++;
      continue;
    }

    // Include directive
    const includeMatch = line.match(/^include\s+([^;]+);$/);
    if (includeMatch) {
      const includePath = includeMatch[1].trim();
      let includeWarning: string | undefined;
      let includedNodes: AidNode[] = [];

      const isGenAid = filePath.endsWith('.gen.aid');
      const isAidFile = includePath.endsWith('.aid');

      const fileContent = fetchFileContent(includePath);

      if (fileContent === null) {
        includeWarning = `Warning: Could not find include file '${includePath}'.`;
      } else if (!isAidFile) {
        includeWarning = `Warning: Including non-.aid file '${includePath}'. Content will be treated as prose.`;
        if (isGenAid) {
          includeWarning += " This is a compile-time warning in a .gen.aid file.";
        }
        // Escape '#' for markdown content if it's not an aid file
        // This ensures that if the prose content is later re-parsed, '#' is not treated as a comment.
        const escapedContent = fileContent.replace(/(?<!\\)#/g, '\\#'); // Escape non-escaped hashes
        includedNodes.push({ type: 'prose', content: escapedContent });
      } else { // It's an .aid file
        if (isGenAid) {
          includeWarning = `Warning: Including .aid file '${includePath}' in a .gen.aid file.`;
        }
        includedNodes = parse(fileContent, includePath); // Recursive parsing
      }

      nodes.push({
        type: 'include',
        path: includePath,
        content: includedNodes,
        warning: includeWarning,
      });
      i++;
      continue;
    }

    // Module block
    const moduleMatch = line.match(/^(\w+)\s*\{$/);
    if (moduleMatch) {
      const moduleName = moduleMatch[1];
      let moduleContentLines: string[] = [];
      i++; // Move past the opening brace line

      let braceCount = 1;
      while (i < lines.length && braceCount > 0) {
        const currentLine = lines[i];
        const trimmedLine = currentLine.trim();

        if (trimmedLine === '{') {
          braceCount++;
        } else if (trimmedLine === '}') {
          braceCount--;
        }

        if (braceCount > 0) { // Only add content if we are still inside the module and not the closing brace
          moduleContentLines.push(currentLine);
        }
        i++;
      }

      // If braceCount is not 0, it means there was an unclosed module.
      // For robustness, we proceed with what we have. A real parser might throw an error.

      const moduleContent = moduleContentLines.join('\n');
      const parsedModuleInstructions = parse(moduleContent, filePath); // Recursive parsing

      nodes.push({
        type: 'module',
        name: moduleName,
        instructions: parsedModuleInstructions,
      });
      continue;
    }

    // Parameter definition
    const paramMatch = line.match(/^(\w+)=([^;]+);$/);
    if (paramMatch) {
      const paramName = paramMatch[1];
      const paramValue = paramMatch[2];
      let paramWarning: string | undefined;

      // Special handling for known parameters
      if (!['type', 'path', 'files'].includes(paramName)) {
        paramWarning = `Warning: Unknown parameter '${paramName}'.`;
      }

      nodes.push({
        type: 'param',
        name: paramName,
        value: paramValue,
        warning: paramWarning,
      });
      i++;
      continue;
    }

    // If none of the above, treat as prose
    nodes.push({ type: 'prose', content: line });
    i++;
  }

  return nodes;
}
