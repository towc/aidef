import * as path from 'path';

export interface LeafGenAidLeafJson {
    prompt: string;
    files: string[];
    commands: string[];
}

/**
 * Creates a folder for a leaf node and writes its leaf.gen.aid.leaf.json file.
 * @param name The name of the leaf node (folder name).
 * @param prompt The prompt content for the leaf.
 * @param files An array of file paths for the leaf, relative to the project root.
 * @param commands An array of commands for the leaf.
 * @param currentPath The current base path (relative to the project root).
 * @param writeFile The function to write file content (e.g., default_api.write_file).
 * @param registerFileForOverlapCheck A function to register files for overlap checking.
 */
export async function createLeaf(
    name: string,
    prompt: string,
    files: string[],
    commands: string[],
    currentPath: string,
    writeFile: (path: string, content: string) => Promise<void>,
    registerFileForOverlapCheck: (filePath: string) => void,
): Promise<void> {
    const leafDirPath = path.join(currentPath, name);
    const leafGenAidLeafJsonPath = path.join(leafDirPath, 'leaf.gen.aid.leaf.json');

    const leafContent: LeafGenAidLeafJson = {
        prompt,
        files,
        commands,
    };

    // Register files for overlap check. The 'files' array is expected to contain paths relative to the project root.
    for (const file of files) {
        registerFileForOverlapCheck(file);
    }

    await writeFile(leafGenAidLeafJsonPath, JSON.stringify(leafContent, null, 2));
    console.log(`Generated leaf file: ${leafGenAidLeafJsonPath}`);
}
