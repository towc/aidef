
/**
 * @file Defines the types for project configuration.
 */

/**
 * Interface for the project configuration.
 */
export interface ProjectConfig {
  /**
   * An optional array of additional shell commands that are whitelisted.
   * These commands will be merged with the default whitelisted commands.
   */
  additionalWhitelistedCommands?: string[];
}
