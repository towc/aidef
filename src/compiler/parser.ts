// src/compiler/parser.ts
import { readFileSync } from '../utils/file';
import * as path from 'path';

export function parseAidFile(filePath: string, visitedFiles = new Set<string>()): string {
  if (visitedFiles.has(filePath)) {
    console.warn(`Circular dependency detected: ${filePath} already visited. Skipping.`);
    return ''; // Return empty string to break the cycle gracefully
  }
  visitedFiles.add(filePath);

  let content = readFileSync(filePath);
  let processedContent = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Handle comments
    if (trimmedLine.startsWith('#')) {
      continue; // Skip comment lines
    }

    // Handle include statements
    const includeMatch = trimmedLine.match(/^include\s+(.+?);$/);
    if (includeMatch) {
      const includedPath = includeMatch[1];
      const absoluteIncludedPath = path.resolve(path.dirname(filePath), includedPath);

      // Check if it's an HTTP link
      if (includedPath.startsWith('https://')) {
        // TODO: Implement web request for includes. For now, we'll just treat it as prose.
        console.warn(`HTTP include not yet supported for automated fetching: ${includedPath}. Treating as prose.`);
        // For now, just include the line as is, maybe encapsulated as prose if it's not .aid
        processedContent.push(line);
        continue;
      }

      // Check if it's an .aid file
      if (absoluteIncludedPath.endsWith('.aid')) {
        processedContent.push(parseAidFile(absoluteIncludedPath, visitedFiles));
      } else {
        // Non-.aid file, treat as prose. Escape '#'
        const includedContent = readFileSync(absoluteIncludedPath)
          .split('\n')
          .map(l => l.startsWith('#') ? `\\#${l.substring(1)}` : l) // Escape markdown headers
          .join('\n');
        processedContent.push(`'''\n${includedContent}\n'''`); // Encapsulate as prose
      }
      continue;
    }

    // Other lines (prose, module blocks, params)
    processedContent.push(line);
  }

  visitedFiles.delete(filePath);
  return processedContent.join('\n');
}
