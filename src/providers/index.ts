/**
 * Provider Module
 * 
 * Factory and exports for AI provider adapters.
 */

import type { Provider } from '../types';
import { AnthropicProvider, createAnthropicProvider } from './anthropic';
import { OpenAIProvider, createOpenAIProvider } from './openai';

// =============================================================================
// Re-exports
// =============================================================================

export { AnthropicProvider, createAnthropicProvider } from './anthropic';
export { OpenAIProvider, createOpenAIProvider } from './openai';
export {
  CallLogger,
  getCallLogger,
  setCallLogger,
  resetCallLogger,
} from './call-logger';
export {
  buildCompileSystemPrompt,
  buildCompileUserPrompt,
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
  parseCompileResponse,
  parseGenerateResponse,
  formatContext,
  createEmptyContext,
  generateCallId,
} from './provider';

// =============================================================================
// Provider Factory
// =============================================================================

export type ProviderName = 'anthropic' | 'openai';

export interface ProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

/**
 * Get a provider by name.
 * 
 * @param name - Provider name ('anthropic' or 'openai')
 * @param options - Optional configuration overrides
 * @returns The provider instance
 * @throws Error if provider name is not recognized
 * 
 * @example
 * ```ts
 * const provider = getProvider('anthropic');
 * const result = await provider.compile(request);
 * ```
 */
export function getProvider(name: string, options?: ProviderOptions): Provider {
  switch (name.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      return createAnthropicProvider(options);
    
    case 'openai':
    case 'gpt':
      return createOpenAIProvider(options);
    
    default:
      throw new Error(
        `Unknown provider: "${name}". Supported providers: anthropic, openai`
      );
  }
}

/**
 * Check if a provider name is valid.
 */
export function isValidProvider(name: string): boolean {
  const normalized = name.toLowerCase();
  return ['anthropic', 'claude', 'openai', 'gpt'].includes(normalized);
}

/**
 * Get the list of supported provider names.
 */
export function getSupportedProviders(): ProviderName[] {
  return ['anthropic', 'openai'];
}

/**
 * Get the default provider based on available API keys.
 * Prefers Anthropic if both are available.
 */
export function getDefaultProvider(options?: ProviderOptions): Provider {
  // Check for Anthropic first
  if (process.env.ANTHROPIC_API_KEY || options?.apiKey) {
    try {
      return createAnthropicProvider(options);
    } catch {
      // Fall through to OpenAI
    }
  }
  
  // Check for OpenAI
  if (process.env.OPENAI_API_KEY || options?.apiKey) {
    try {
      return createOpenAIProvider(options);
    } catch {
      // Fall through to error
    }
  }
  
  throw new Error(
    'No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.'
  );
}
