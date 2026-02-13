
/**
 * @file Manages whitelisted shell commands for the project.
 */

import { ProjectConfig } from './configTypes';

/**
 * The default set of whitelisted shell commands.
 */
const DEFAULT_WHITELISTED_COMMANDS: string[] = [
  'npm init',
  'npm install',
  'bun install',
];

/**
 * In a real application, this function would load the project configuration.
 * For this example, we'll return a mock configuration.
 * @returns {ProjectConfig} The project configuration.
 */
function getProjectConfig(): ProjectConfig {
  // TODO: Implement actual configuration loading logic (e.g., from a file).
  // For demonstration, returning a mock config.
  return {
    // additionalWhitelistedCommands: ['yarn install', 'pnpm install'],
  };
}

/**
 * Checks if a given shell command is whitelisted.
 * A command is whitelisted if it's in the default list or in the project's additional whitelisted commands.
 * @param {string} command The shell command to check.
 * @returns {boolean} True if the command is whitelisted, false otherwise.
 */
export function isCommandWhitelisted(command: string): boolean {
  const projectConfig = getProjectConfig();
  const additionalCommands = projectConfig.additionalWhitelistedCommands || [];

  const allWhitelistedCommands = [
    ...DEFAULT_WHITELISTED_COMMANDS,
    ...additionalCommands,
  ];

  // Normalize commands for comparison (e.g., trim whitespace)
  const normalizedCommand = command.trim();

  return allWhitelistedCommands.some(whitelistedCmd => whitelistedCmd.trim() === normalizedCommand);
}

/**
 * This function would be called by the `--analyse` mode to suggest new commands for whitelisting.
 * In a real scenario, this might write to a temporary file, a log, or an interactive prompt
 * for the user to review and potentially add to their project configuration.
 * @param {string} command The command suggested for whitelisting.
 */
export function suggestCommandForWhitelist(command: string): void {
  console.log(`[ANALYSE MODE] Suggested command for whitelisting: "${command}"`);
  // TODO: Implement actual logic for handling suggestions, e.g., storing them
  // for user review or generating a configuration snippet.
}
