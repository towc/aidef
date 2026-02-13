import { AidDocument, AidNode, AidModule, AidParam, AidInclude, AidProse, AidComment } from './aid_types';

/**
 * Parses the given content of an AIDef file into an AidDocument AST.
 * @param content The string content of the .aid file.
 * @returns An AidDocument representing the parsed content.
 */
export function parse(content: string): AidDocument {
  const { nodes, newIndex } = parseBlock(content, 0);
  if (newIndex < content.length) {
    // This case should ideally not happen if the parser correctly consumes all content,
    // but it's a safeguard for unparsed trailing content.
    // For now, we'll just return the parsed nodes. A more robust parser might throw an error.
    // Or, if there's just whitespace left, it's fine.
    const remaining = content.substring(newIndex).trim();
    if (remaining.length > 0) {
        // This indicates unparsed content. Could be an error or just trailing prose.
        // For now, let's not throw, but acknowledge it.
        // console.warn("Unparsed content remaining at the end of the document:", remaining);
    }
  }
  return nodes;
}

/**
 * Helper function to parse a block of AIDef instructions.
 * This function is recursive to handle nested modules.
 * @param content The full content string.
 * @param startIndex The index in the content to start parsing from.
 * @param endChar An optional character that signifies the end of the current block (e.g., '}').
 * @returns An object containing the parsed nodes and the new index after parsing.
 */
function parseBlock(content: string, startIndex: number, endChar?: string): { nodes: AidNode[], newIndex: number } {
  const nodes: AidNode[] = [];
  let currentIndex = startIndex;

  while (currentIndex < content.length) {
    // Skip leading whitespace and newlines
    while (currentIndex < content.length && /\s/.test(content[currentIndex])) {
      currentIndex++;
    }

    if (currentIndex >= content.length) break; // Reached end of content

    // Check for the end character of the current block
    if (endChar && content[currentIndex] === endChar) {
      currentIndex++; // Consume the end character
      return { nodes, newIndex: currentIndex };
    }

    const remainingContent = content.substring(currentIndex);

    let match: RegExpMatchArray | null;

    // 1. Comment: # anything_until_newline
    match = remainingContent.match(/^#([^\n]*)/);
    if (match) {
      nodes.push({ type: 'comment', content: match[1].trim() });
      currentIndex += match[0].length;
      continue;
    }

    // 2. Include: include <path>;
    // Capture the full statement for originalLine, and the path separately.
    match = remainingContent.match(/^(include\s+([^;]+);\s*)/);
    if (match) {
      nodes.push({ type: 'include', path: match[2].trim(), originalLine: match[1].trim() });
      currentIndex += match[0].length;
      continue;
    }

    // 3. Module: <name> { ... }
    // Module name can be followed by whitespace, then '{' 
    match = remainingContent.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\{\s*/);
    if (match) {
      const moduleName = match[1];
      currentIndex += match[0].length; // Move past "ModuleName {"
      const blockResult = parseBlock(content, currentIndex, '}');
      nodes.push({ type: 'module', name: moduleName, content: blockResult.nodes });
      currentIndex = blockResult.newIndex; // Update index after parsing the nested block
      continue;
    }

    // 4. Param: <name>=<value>;
    match = remainingContent.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+);\s*/);
    if (match) {
      nodes.push({ type: 'param', name: match[1], value: match[2].trim() });
      currentIndex += match[0].length;
      continue;
    }

    // 5. Prose (fallback for anything else on the current line)
    // Consume the current line as prose if it doesn't match any specific syntax.
    const nextNewlineIndex = remainingContent.indexOf('\n');
    let lineContent: string;
    if (nextNewlineIndex !== -1) {
      lineContent = remainingContent.substring(0, nextNewlineIndex);
      currentIndex += nextNewlineIndex + 1; // Move past the newline
    } else {
      lineContent = remainingContent;
      currentIndex = content.length; // Reached end of content
    }

    const trimmedLineContent = lineContent.trim();
    if (trimmedLineContent.length > 0) {
      nodes.push({ type: 'prose', content: trimmedLineContent });
    }
  }

  // If we expected an endChar (e.g., '}') but reached the end of content without finding it
  if (endChar) {
    throw new Error(`Unclosed block: Expected '${endChar}' but reached end of content.`);
  }

  return { nodes, newIndex: currentIndex };
}
