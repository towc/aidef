import * as path from 'path';

/**
 * Creates a folder for a child node and writes its node.gen.aid file.
 * @param name The name of the child node (folder name).
 * @param content The content for the node.gen.aid file.
 * @param currentPath The current base path (relative to the project root).
 * @param writeFile The function to write file content (e.g., default_api.write_file).
 */
export async function createNode(
    name: string,
    content: string,
    currentPath: string,
    writeFile: (path: string, content: string) => Promise<void>
): Promise<void> {
    const nodeDirPath = path.join(currentPath, name);
    const nodeGenAidPath = path.join(nodeDirPath, 'node.gen.aid');

    await writeFile(nodeGenAidPath, content);
    console.log(`Generated node file: ${nodeGenAidPath}`);
}
