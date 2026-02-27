/**
 * Provider factory and re-exports.
 */

export type {
  LLMProvider,
  LLMResponse,
  GenerateOptions,
  ToolDefinition,
  ToolParameter,
  FunctionCall,
  FunctionResponse,
  Message,
  ProviderName,
  ProviderConfig,
} from './types';

import type { LLMProvider, ProviderName, ProviderConfig } from './types';
import { GeminiProvider } from './gemini';
import { AnthropicProvider } from './anthropic';

/**
 * Create an LLM provider from configuration.
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config.apiKey, config.model);
    case 'anthropic':
      return new AnthropicProvider(config.apiKey, config.model);
    default:
      throw new Error(`Unknown provider: ${config.provider}. Supported: gemini, anthropic`);
  }
}

/**
 * Resolve which API key to use based on the provider.
 * Checks environment variables in order of specificity.
 */
export function resolveApiKey(provider: ProviderName): string {
  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY environment variable is required for Gemini provider');
    return key;
  } else if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY environment variable is required for Anthropic provider');
    return key;
  }
  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Default models per provider.
 */
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-6',
};
