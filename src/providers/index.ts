/**
 * Provider Module
 * 
 * Factory and exports for AI provider adapters.
 */

import type { Provider } from '../types';
import { AnthropicProvider, createAnthropicProvider } from './anthropic';
import { OpenAIProvider, createOpenAIProvider } from './openai';
import { GoogleProvider } from './google';

// =============================================================================
// Re-exports
// =============================================================================

export { AnthropicProvider, createAnthropicProvider } from './anthropic';
export { OpenAIProvider, createOpenAIProvider } from './openai';
export { GoogleProvider } from './google';
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

export type ProviderName = 'anthropic' | 'openai' | 'google';

export interface ProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

/**
 * Get a provider by name.
 * 
 * @param name - Provider name ('anthropic', 'openai', or 'google')
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
    
    case 'google':
    case 'gemini':
      return new GoogleProvider(options);
    
    default:
      throw new Error(
        `Unknown provider: "${name}". Supported providers: anthropic, openai, google`
      );
  }
}

/**
 * Check if a provider name is valid.
 */
export function isValidProvider(name: string): boolean {
  const normalized = name.toLowerCase();
  return ['anthropic', 'claude', 'openai', 'gpt', 'google', 'gemini'].includes(normalized);
}

/**
 * Get the list of supported provider names.
 */
export function getSupportedProviders(): ProviderName[] {
  return ['anthropic', 'openai', 'google'];
}

/**
 * Get the default provider based on available API keys.
 * Prefers Anthropic, then Google, then OpenAI.
 */
export function getDefaultProvider(options?: ProviderOptions): Provider {
  // Check for Anthropic first
  if (process.env.ANTHROPIC_API_KEY || options?.apiKey) {
    try {
      return createAnthropicProvider(options);
    } catch {
      // Fall through to next
    }
  }
  
  // Check for Google/Gemini
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || options?.apiKey) {
    try {
      return new GoogleProvider(options);
    } catch {
      // Fall through to next
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
    'No API key found. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY environment variable.'
  );
}
