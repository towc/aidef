// human_compiler.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { fetchWithCache } from './web_fetcher';

const INCLUDE_REGEX = /include\s+<([^>]+)>;/g;
const AID_EXTENSION = '.aid';

// Cache for local files to prevent redundant reads and potential infinite loops
// Cleared per compileHumanAid call
const localFileCache = new Map<string, string>();

async function readFileContent(filePath: string): Promise<string> {
  if (localFileCache.has(filePath)) {
    return localFileCache.get(filePath)!;
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    localFileCache.set(filePath, content);
    return content;
  } catch (error) {
    console.error(`Error reading local file ${filePath}:`, error);
    throw error;
  }
}

function escapeMarkdownHashes(content: string): string {
  // Escape '#' characters that might be interpreted as markdown headers
  // This regex targets '#' at the beginning of a line, optionally preceded by whitespace.
  return content.replace(/^(\s*)#/gm, '$1\\#');
}

/**
 * Recursively processes the content of an .aid file, resolving include statements.
 * @param currentPath The absolute path of the file currently being processed.
 * @param content The content of the current file.
 * @param processedPaths A set of paths currently in the recursion stack to detect circular dependencies.
 * @returns The processed content with all includes resolved.
 */
async function processAidContent(currentPath: string, content: string, processedPaths: Set<string>): Promise<string> {
  // Prevent infinite recursion for circular includes
  if (processedPaths.has(currentPath)) {
    console.warn(`Circular include detected for: ${currentPath}. Skipping.`);
    return ''; // Return empty string for circular includes
  }
  processedPaths.add(currentPath);

  const matches: { fullMatch: string; includePath: string; index: number }[] = [];
  let match;
  // Reset regex lastIndex before starting to ensure all matches are found from the beginning
  INCLUDE_REGEX.lastIndex = 0;
  while ((match = INCLUDE_REGEX.exec(content)) !== null) {
    matches.push({
      fullMatch: match[0],
      includePath: match[1],
      index: match.index,
    });
  }

  if (matches.length === 0) {
    processedPaths.delete(currentPath); // Remove from set if no includes were found
    return content;
  }

  const replacements = await Promise.all(
    matches.map(async ({ fullMatch, includePath }) => {
      let includedContent = '';
      let absoluteIncludePath: string;
      let isAidFile = false;

      if (includePath.startsWith('https://')) {
        // Web URL
        absoluteIncludePath = includePath; // URL is its own absolute path
        isAidFile = includePath.endsWith(AID_EXTENSION);
        includedContent = await fetchWithCache(includePath);
      } else {
        // Local file
        absoluteIncludePath = path.resolve(path.dirname(currentPath), includePath);
        isAidFile = absoluteIncludePath.endsWith(AID_EXTENSION);
        includedContent = await readFileContent(absoluteIncludePath);
      }

      let processedIncludedContent = '';
      if (isAidFile) {
        processedIncludedContent = await processAidContent(absoluteIncludePath, includedContent, processedPaths);
      } else {
        // Not an .aid file, treat as prose
        processedIncludedContent = `
/* --- Start included prose from ${includePath} --- */
${escapeMarkdownHashes(includedContent)}
/* --- End included prose from ${includePath} --- */
`;
      }
      return { fullMatch, processedIncludedContent };
    })
  );

  // Reconstruct the content with replacements
  let result = content;
  // Iterate in reverse order to avoid issues with index shifts when replacing substrings
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { fullMatch, processedIncludedContent } = replacements[i];
    result = result.replace(fullMatch, processedIncludedContent);
  }

  processedPaths.delete(currentPath); // Remove from set after processing
  return result;
}

/**
 * Compiles a human-written .aid file by resolving all 'include' statements recursively.
 * Local .aid files are read from the filesystem, and HTTPS links are fetched via web requests.
 * Non-.aid files are encapsulated as prose.
 *
 * @param rootAidPath The path to the root .aid file (e.g., 'root.aid').
 * @returns A Promise that resolves to the flattened, processed .aid content string.
 */
export async function compileHumanAid(rootAidPath: string): Promise<string> {
  // Clear local file cache for a fresh compilation run
  localFileCache.clear();

  const absoluteRootAidPath = path.resolve(rootAidPath);
  const initialContent = await readFileContent(absoluteRootAidPath);
  const processedPaths = new Set<string>(); // Tracks paths in the current recursion stack to detect cycles
  const finalContent = await processAidContent(absoluteRootAidPath, initialContent, processedPaths);
  return finalContent;
}
