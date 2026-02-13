import * as fs from 'fs/promises';
import * as path from 'path';

interface LeafConfig {
  prompt: string;
  files: string[];
  commands: string[] | null;
}

/**
 * Creates a leaf node directory and its leaf.gen.aid.leaf.json file.
 * @param name The name of the leaf node folder.
 * @param prompt Instructions for the leaf node generation.
 * @param files List of files to be created by this leaf.
 * @param commands Optional shell commands to run.
 * @param parentDirPath The path to the parent directory.
 * @returns The full path to the created leaf directory.
 */
export async function genLeaf(
  name: string,
  prompt: string,
  files: string[],
  commands: string[] | null,
  parentDirPath: string
): Promise<string> {
  const leafDirPath = path.join(parentDirPath, name);
  const configFilePath = path.join(leafDirPath, 'leaf.gen.aid.leaf.json');

  await fs.mkdir(leafDirPath, { recursive: true });

  const leafConfig: LeafConfig = {
    prompt,
    files,
    commands,
  };

  await fs.writeFile(configFilePath, JSON.stringify(leafConfig, null, 2), 'utf-8');
  console.log(`Created leaf config: ${configFilePath}`);
  return leafDirPath;
}
