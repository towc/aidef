/**
 * Anthropic Claude provider adapter.
 * Uses @anthropic-ai/sdk.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMResponse,
  GenerateOptions,
  ToolDefinition,
  FunctionCall,
  Message,
} from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Convert generic tool definitions to Anthropic's tool format.
 * Anthropic uses JSON Schema directly (no enum conversion needed).
 */
function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Messages.Tool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: tool.parameters.properties as Record<string, unknown>,
      required: tool.parameters.required,
    },
  }));
}

/**
 * Convert generic messages to Anthropic's messages format.
 * 
 * Key differences from Gemini:
 * - System prompt is a separate parameter (not in messages)
 * - Tool results go in user messages with type: 'tool_result'
 * - Assistant messages contain content blocks (text + tool_use)
 * - Each tool_use has a unique id that must be referenced in tool_result
 */
function toAnthropicMessages(messages: Message[]): Anthropic.Messages.MessageParam[] {
  const result: Anthropic.Messages.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      result.push({
        role: 'user',
        content: msg.text || '',
      });
    } else if (msg.role === 'assistant') {
      const content: Anthropic.Messages.ContentBlockParam[] = [];

      if (msg.text) {
        content.push({ type: 'text', text: msg.text });
      }

      if (msg.functionCalls) {
        for (const fc of msg.functionCalls) {
          content.push({
            type: 'tool_use',
            id: fc.id || `call_${Math.random().toString(36).slice(2)}`,
            name: fc.name,
            input: fc.args,
          });
        }
      }

      if (content.length > 0) {
        result.push({ role: 'assistant', content });
      }
    } else if (msg.role === 'tool_result') {
      if (msg.functionResponses && msg.functionResponses.length > 0) {
        const content: Anthropic.Messages.ToolResultBlockParam[] = msg.functionResponses.map(fr => ({
          type: 'tool_result' as const,
          tool_use_id: fr.callId || '',
          content: JSON.stringify(fr.response),
        }));
        result.push({ role: 'user', content });
      }
    }
  }

  return result;
}

/**
 * Parse Anthropic response into our generic LLMResponse.
 */
function parseAnthropicResponse(response: Anthropic.Messages.Message): LLMResponse {
  const functionCalls: FunctionCall[] = [];
  let text: string | undefined;

  for (const block of response.content) {
    if (block.type === 'text') {
      text = (text || '') + block.text;
    } else if (block.type === 'tool_use') {
      functionCalls.push({
        id: block.id,
        name: block.name,
        args: (block.input as Record<string, unknown>) || {},
      });
    }
  }

  return {
    text,
    functionCalls,
    raw: response,
  };
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey: string, model?: string) {
    this.model = model || DEFAULT_MODEL;
    this.client = new Anthropic({ apiKey });
  }

  async generate(options: GenerateOptions): Promise<LLMResponse> {
    const messages = toAnthropicMessages(options.messages);

    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: options.maxTokens || 16384,
      messages,
    };

    if (options.systemPrompt) {
      params.system = options.systemPrompt;
    }

    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
    }

    if (options.tools && options.tools.length > 0) {
      params.tools = toAnthropicTools(options.tools);
    }

    const response = await this.client.messages.create(params);
    return parseAnthropicResponse(response);
  }
}
