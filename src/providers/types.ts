/**
 * Provider abstraction for LLM APIs.
 * 
 * Supports two usage modes:
 * 1. Simple text generation (single-shot, no tools)
 * 2. Agentic tool loop (multi-turn conversation with function calling)
 * 
 * All providers must implement the LLMProvider interface.
 */

// =============================================================================
// Tool Definition (provider-agnostic)
// =============================================================================

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

// =============================================================================
// Messages (provider-agnostic)
// =============================================================================

export interface FunctionCall {
  id?: string;       // Anthropic requires tracking tool_use_id; Gemini doesn't
  name: string;
  args: Record<string, unknown>;
}

export interface FunctionResponse {
  callId?: string;   // Maps to tool_use_id for Anthropic
  name: string;
  response: Record<string, unknown>;
}

export interface Message {
  role: 'user' | 'assistant' | 'tool_result';
  text?: string;
  functionCalls?: FunctionCall[];
  functionResponses?: FunctionResponse[];
}

// =============================================================================
// LLM Response (provider-agnostic)
// =============================================================================

export interface LLMResponse {
  /** Text content from the model (may be undefined if only tool calls) */
  text?: string;
  /** Function/tool calls made by the model (empty array if none) */
  functionCalls: FunctionCall[];
  /** Raw response from the provider (for debugging) */
  raw?: unknown;
}

// =============================================================================
// Generation Options
// =============================================================================

export interface GenerateOptions {
  /** Conversation history */
  messages: Message[];
  /** Tools available to the model */
  tools?: ToolDefinition[];
  /** Temperature (0 = deterministic) */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** System prompt (prepended to conversation) */
  systemPrompt?: string;
}

// =============================================================================
// Provider Interface
// =============================================================================

export interface LLMProvider {
  /** Human-readable name of the provider */
  readonly name: string;
  /** Model identifier being used */
  readonly model: string;

  /**
   * Generate a response from the LLM.
   * Handles both simple text generation and tool-calling conversations.
   */
  generate(options: GenerateOptions): Promise<LLMResponse>;
}

// =============================================================================
// Provider Factory
// =============================================================================

export type ProviderName = 'gemini' | 'anthropic';

export interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  model?: string;  // Override default model
}
