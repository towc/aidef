import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios'; // Assuming axios is installed for HTTP requests

/**
 * Checks if a given string is a valid URL.
 * @param str The string to check.
 * @returns True if the string is a URL, false otherwise.
 */
function isUrl(str: string): boolean {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

/**
 * Fetches content from a local file.
 * @param filePath The path to the local file.
 * @returns A promise that resolves with the file content as a string.
 * @throws If the file cannot be read.
 */
async function fetchLocalFile(filePath: string): Promise<string> {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        console.error(`Error reading local file ${filePath}:`, error);
        throw error;
    }
}

/**
 * Fetches content from an HTTPS URL.
 * @param url The HTTPS URL.
 * @returns A promise that resolves with the content as a string.
 * @throws If the content cannot be fetched from the URL.
 */
async function fetchHttpsFile(url: string): Promise<string> {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`Error fetching content from URL ${url}:`, error);
        throw error;
    }
}

/**
 * Escapes '#' characters and encapsulates content as prose for non-.aid files.
 * The content is wrapped in a markdown text block.
 * @param content The content to escape and encapsulate.
 * @returns The escaped and encapsulated content string.
 */
function escapeAndEncapsulateProse(content: string): string {
    // Escape '#' characters to prevent them from being interpreted as AID directives
    const escapedContent = content.replace(/#/g, '\\#');
    // Encapsulate as a markdown text block
    return `\`\`\`text\n${escapedContent}\n\`\`\``;
}

/**
 * Recursively resolves 'include' statements within the given content.
 * It fetches content from local files or HTTPS links, and processes non-.aid files.
 * @param content The content string to process for includes.
 * @param currentFilePath The path of the file currently being processed (used for resolving relative paths).
 * @returns A promise that resolves with the content string with all includes resolved.
 */
async function resolveIncludes(content: string, currentFilePath: string): Promise<string> {
    const includeRegex = /include\s+"([^"]+)"/g;
    let newContentParts: string[] = [];
    let lastIndex = 0;
    let match;

    // Reset regex lastIndex for fresh execution in case it was used before
    includeRegex.lastIndex = 0;

    while ((match = includeRegex.exec(content)) !== null) {
        const fullMatch = match[0]; // e.g., 'include "path/to/file.aid"'
        const includePath = match[1]; // e.g., 'path/to/file.aid'

        // Add the part of the string before the current match
        newContentParts.push(content.substring(lastIndex, match.index));

        let includedContent = '';
        let absoluteIncludePath = '';
        let isAidFile = false;

        if (isUrl(includePath)) {
            // HTTPS link
            absoluteIncludePath = includePath; // URL is already absolute
            includedContent = await fetchHttpsFile(includePath);
            isAidFile = includePath.endsWith('.aid');
        } else {
            // Local file
            // Resolve the absolute path of the included file relative to the current file
            absoluteIncludePath = path.resolve(path.dirname(currentFilePath), includePath);
            includedContent = await fetchLocalFile(absoluteIncludePath);
            isAidFile = absoluteIncludePath.endsWith('.aid');
        }

        if (isAidFile) {
            // Recursively resolve includes in the included .aid file
            includedContent = await resolveIncludes(includedContent, absoluteIncludePath);
        } else {
            // For non-.aid files, escape '#' and encapsulate as prose
            includedContent = escapeAndEncapsulateProse(includedContent);
        }

        // Add the resolved included content
        newContentParts.push(includedContent);
        // Update lastIndex to the end of the current match
        lastIndex = includeRegex.lastIndex;
    }

    // Add the remaining part of the string after the last match
    newContentParts.push(content.substring(lastIndex));

    return newContentParts.join('');
}

/**
 * The main function for the 'human mode' processor.
 * It takes an .aid file path, recursively resolves all 'include' statements,
 * fetches content from local files or HTTPS links, and processes non-.aid files
 * by escaping '#' and encapsulating them as prose.
 * The tool never modifies human-written .aid files.
 * @param inputFilePath The path to the root .aid file (e.g., 'root.aid').
 * @returns A promise that resolves with the single, fully resolved .aid content string.
 */
export async function processAidFile(inputFilePath: string): Promise<string> {
    console.log(`Starting processing for ${inputFilePath}`);
    // Fetch the initial content of the root .aid file
    const initialContent = await fetchLocalFile(inputFilePath);
    // Recursively resolve all include statements
    const resolvedContent = await resolveIncludes(initialContent, inputFilePath);
    console.log(`Finished processing for ${inputFilePath}`);
    return resolvedContent;
}
