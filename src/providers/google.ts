/**
 * Google (Gemini) Provider
 * 
 * AI provider adapter using @ai-sdk/google.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
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

const DEFAULT_MODEL = 'gemini-2.0-flash';
const PROVIDER_NAME = 'google';

// =============================================================================
// GoogleProvider Class
// =============================================================================

export class GoogleProvider implements Provider {
  public readonly name = PROVIDER_NAME;
  
  private model: string;
  private client: ReturnType<typeof createGoogleGenerativeAI>;
  
  constructor(options: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
  } = {}) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      throw new Error(
        'Google API key is required. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable or pass apiKey option.'
      );
    }
    
    this.model = options.model || DEFAULT_MODEL;
    this.client = createGoogleGenerativeAI({
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
        inputTokens: result.usage?.promptTokens || 0,
        outputTokens: result.usage?.completionTokens || 0,
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
        inputTokens: result.usage?.promptTokens || 0,
        outputTokens: result.usage?.completionTokens || 0,
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
   * Test the connection.
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await generateText({
        model: this.client(this.model),
        prompt: 'Say "ok" and nothing else.',
        maxTokens: 10,
      });
      return result.text.toLowerCase().includes('ok');
    } catch {
      return false;
    }
  }
}
