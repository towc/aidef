import * as path from 'path';
import { FileOverlapChecker } from './file_overlap_checker';
import { createNode } from './node_generator';
import { createLeaf } from './leaf_generator';

// Placeholder for aid_parser. In a real scenario, this would be an actual parser module.
// For this exercise, we'll assume it returns the content as a string that the LLM can interpret.
function parseAid(content: string): string {
    // Implement actual .aid parsing logic here.
    // For now, we return the content directly for LLM processing.
    return content;
}

// Define the interface for the tools that the LLM will use
interface GenTools {
    gen_node: (name: string, content: string) => Promise<void>;
    gen_leaf: (name: string, prompt: string, files: string[], commands: string[]) => Promise<void>;
}

/**
 * Compiles a .gen.aid file, orchestrating LLM interaction and file generation.
 * It exports a function `compileGenAid`.
 *
 * @param genAidContent The content of the .gen.aid file.
 * @param currentPath The current base path for generation, relative to the project root.
 * @param writeFile The function to write file content (e.g., default_api.write_file).
 * @param llmCall A function that simulates an LLM call, taking system prompt, user prompt, and tools.
 *                The LLM is expected to invoke the provided `gen_node` and `gen_leaf` tools.
 */
export async function compileGenAid(
    genAidContent: string,
    currentPath: string,
    writeFile: (path: string, content: string) => Promise<void>,
    llmCall: (systemPrompt: string, userPrompt: string, tools: GenTools) => Promise<void>
): Promise<void> {
    const fileOverlapChecker = new FileOverlapChecker();
    fileOverlapChecker.reset(); // Ensure a clean state for each compilation run

    const parsedContent = parseAid(genAidContent);

    // System prompt to guide the LLM for generating project structure
    const systemPrompt = `
        You are an AI assistant responsible for generating a project structure based on a .gen.aid file.
        Your goal is to interpret the provided .aid content and use the 'gen_node' and 'gen_leaf' tools to define the project's nodes (folders containing other .gen.aid files) and leaves (folders containing leaf.gen.aid.leaf.json files).

        When using gen_node:
        - Call gen_node(name: string, content: string) to create a child node.
        - 'name' should be the folder name for the node, relative to the current generation path.
        - 'content' should be the content for the 'node.gen.aid' file within that folder.

        When using gen_leaf:
        - Call gen_leaf(name: string, prompt: string, files: string[], commands: string[]) to create a leaf node.
        - 'name' should be the folder name for the leaf, relative to the current generation path.
        - 'prompt' should be a comprehensive prompt for the leaf, including all necessary instructions and interfaces for the leaf's own LLM generation. This prompt should be self-contained.
        - 'files' should be an array of strings, representing the paths of the files this leaf is expected to generate, relative to the project root. These paths will be used for compile-time overlap checking.
        - 'commands' should be an array of strings, representing any commands to be executed by the leaf.

        Ensure that the 'prompt' for gen_leaf is self-contained and provides all context needed for the leaf's subsequent generation.
        Aim for predictable and deterministic output by keeping AI calls focused and clear.
    `;

    // Wrap the actual generation functions to be used as LLM tools.
    // These wrappers handle the interaction with the file system and overlap checking.
    const tools: GenTools = {
        gen_node: async (name: string, content: string) => {
            await createNode(name, content, currentPath, writeFile);
        },
        gen_leaf: async (name: string, prompt: string, files: string[], commands: string[]) => {
            await createLeaf(name, prompt, files, commands, currentPath, writeFile, (filePath: string) => {
                // The filePath here is expected to be relative to the project root for overlap checking.
                // The 'files' array passed to gen_leaf should already contain these project-root-relative paths.
                fileOverlapChecker.registerFile(filePath);
            });
        },
    };

    // Simulate LLM call. In a real scenario, this would involve an actual LLM API call
    // that can interpret the parsedContent and invoke the provided tools.
    await llmCall(systemPrompt, parsedContent, tools);
}
