import { loadWhitelistedCommands } from './config_loader';

const DEFAULT_WHITELISTED_COMMANDS: string[] = [
  'npm init',
  'npm install',
  'bun install',
  'yarn install',
];

let whitelistedCommands: Set<string>;
let isInitialized = false;

export async function initializeWhitelist(userConfigPath?: string): Promise<void> {
  whitelistedCommands = new Set(DEFAULT_WHITELISTED_COMMANDS);

  if (userConfigPath) {
    try {
      const userCommands = await loadWhitelistedCommands(userConfigPath);
      userCommands.forEach(cmd => whitelistedCommands.add(cmd));
    } catch (error) {
      console.error(`Failed to load user-defined whitelist from ${userConfigPath}:`, error);
      // Continue with default whitelist even if user config fails
    }
  }
  isInitialized = true;
}

export function isCommandWhitelisted(command: string): boolean {
  if (!isInitialized) {
    console.warn('Whitelist not initialized. Call initializeWhitelist() first.');
    // Depending on desired behavior, could throw an error or return false.
    // For now, returning false as a safe default.
    return false;
  }
  return whitelistedCommands.has(command);
}

export function suggestCommandsForWhitelist(commands: string[]): string[] {
  if (!isInitialized) {
    console.warn('Whitelist not initialized. Call initializeWhitelist() first.');
    return commands; // If not initialized, all commands are "suggestions"
  }
  return commands.filter(command => !whitelistedCommands.has(command));
}
