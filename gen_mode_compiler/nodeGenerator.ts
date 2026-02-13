import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Creates a child node directory and its node.gen.aid file.
 * @param name The name of the child node folder.
 * @param content The .aid specification for the child node.
 * @param parentDirPath The path to the parent directory.
 * @returns The full path to the created node directory.
 */
export async function genNode(name: string, content: string, parentDirPath: string): Promise<string> {
  const nodeDirPath = path.join(parentDirPath, name);
  const aidFilePath = path.join(nodeDirPath, 'node.gen.aid');

  await fs.mkdir(nodeDirPath, { recursive: true });
  await fs.writeFile(aidFilePath, content, 'utf-8');
  console.log(`Created node: ${aidFilePath}`);
  return nodeDirPath;
}
