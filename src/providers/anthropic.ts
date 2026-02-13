/**
 * Anthropic (Claude) Provider
 * 
 * AI provider adapter using @ai-sdk/anthropic.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import type {
  Provider,
  CompileRequest,
  CompileResult,
  GenerateRequest,
  GenerateResult,
} from '../types';
import {
  buildCompileSystemPrompt,
  buildCompileUserPrompt,
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
  parseCompileResponse,
  parseGenerateResponse,
  generateCallId,
} from './provider';
import { getCallLogger } from './call-logger';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const PROVIDER_NAME = 'anthropic';

// =============================================================================
// AnthropicProvider Class
// =============================================================================

export class AnthropicProvider implements Provider {
  public readonly name = PROVIDER_NAME;
  
  private model: string;
  private client: ReturnType<typeof createAnthropic>;
  
  constructor(options: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
  } = {}) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error(
        'Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey option.'
      );
    }
    
    this.model = options.model || DEFAULT_MODEL;
    this.client = createAnthropic({
      apiKey,
      baseURL: options.baseURL,
    });
  }
  
  /**
   * Compile a node spec into child specs.
   */
  async compile(request: CompileRequest): Promise<CompileResult> {
    const systemPrompt = buildCompileSystemPrompt();
    const userPrompt = buildCompileUserPrompt(request);
    
    const startTime = Date.now();
    const callId = generateCallId();
    
    try {
      const result = await generateText({
        model: this.client(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0,
      });
      
      const durationMs = Date.now() - startTime;
      const output = result.text;
      
      // Log the call
      await getCallLogger().log({
        id: callId,
        timestamp: new Date().toISOString(),
        node: request.nodePath,
        phase: 'compile',
        provider: PROVIDER_NAME,
        model: this.model,
        input: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        output,
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0,
        durationMs,
        success: true,
      });
      
      return parseCompileResponse(output);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log the failed call
      await getCallLogger().log({
        id: callId,
        timestamp: new Date().toISOString(),
        node: request.nodePath,
        phase: 'compile',
        provider: PROVIDER_NAME,
        model: this.model,
        input: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        output: '',
        inputTokens: 0,
        outputTokens: 0,
        durationMs,
        success: false,
        error: errorMessage,
      });
      
      throw error;
    }
  }
  
  /**
   * Generate code from a leaf node.
   */
  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const systemPrompt = buildGenerateSystemPrompt();
    const userPrompt = buildGenerateUserPrompt(request);
    
    const startTime = Date.now();
    const callId = generateCallId();
    
    try {
      const result = await generateText({
        model: this.client(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0,
      });
      
      const durationMs = Date.now() - startTime;
      const output = result.text;
      
      // Log the call
      await getCallLogger().log({
        id: callId,
        timestamp: new Date().toISOString(),
        node: request.nodePath,
        phase: 'generate',
        provider: PROVIDER_NAME,
        model: this.model,
        input: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        output,
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0,
        durationMs,
        success: true,
      });
      
      return parseGenerateResponse(output);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log the failed call
      await getCallLogger().log({
        id: callId,
        timestamp: new Date().toISOString(),
        node: request.nodePath,
        phase: 'generate',
        provider: PROVIDER_NAME,
        model: this.model,
        input: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        output: '',
        inputTokens: 0,
        outputTokens: 0,
        durationMs,
        success: false,
        error: errorMessage,
      });
      
      throw error;
    }
  }
  
  /**
   * Test if the provider is configured and working.
   */
  async testConnection(): Promise<boolean> {
    try {
      await generateText({
        model: this.client(this.model),
        prompt: 'Say "ok" and nothing else.',
        temperature: 0,
        maxOutputTokens: 10,
      });
      return true;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an Anthropic provider with default configuration.
 */
export function createAnthropicProvider(options?: {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}): AnthropicProvider {
  return new AnthropicProvider(options);
}
