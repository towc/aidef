import * as fs from 'fs/promises';

interface AidConfig {
  whitelistedCommands?: string[];
  // Other potential config properties
}

export async function loadWhitelistedCommands(configPath: string): Promise<string[]> {
  try {
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const config: AidConfig = JSON.parse(fileContent);
    return config.whitelistedCommands || [];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File not found, return empty array as no user commands
      return [];
    }
    console.error(`Error loading user config from ${configPath}:`, error);
    // For now, returning empty array if there's a parsing error or other read error.
    return [];
  }
}
