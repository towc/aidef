/**
 * Google Gemini provider adapter.
 * Uses @google/genai SDK.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type {
  LLMProvider,
  LLMResponse,
  GenerateOptions,
  ToolDefinition,
  ToolParameter,
  FunctionCall,
  Message,
} from './types';

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Convert our generic ToolParameter type string to Gemini's Type enum.
 */
function toGeminiType(type: string): Type {
  switch (type) {
    case 'string': return Type.STRING;
    case 'number': return Type.NUMBER;
    case 'boolean': return Type.BOOLEAN;
    case 'object': return Type.OBJECT;
    case 'array': return Type.ARRAY;
    default: return Type.STRING;
  }
}

/**
 * Convert a generic ToolParameter to Gemini's schema format.
 */
function toGeminiSchema(param: ToolParameter): any {
  const schema: any = { type: toGeminiType(param.type), description: param.description };
  if (param.properties) {
    schema.properties = {};
    for (const [key, value] of Object.entries(param.properties)) {
      schema.properties[key] = toGeminiSchema(value);
    }
  }
  if (param.required) schema.required = param.required;
  if (param.items) schema.items = toGeminiSchema(param.items);
  if (param.enum) schema.enum = param.enum;
  return schema;
}

/**
 * Convert generic tool definitions to Gemini's functionDeclarations format.
 */
function toGeminiFunctionDeclarations(tools: ToolDefinition[]): any[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        Object.entries(tool.parameters.properties).map(([key, value]) => [key, toGeminiSchema(value)])
      ),
      required: tool.parameters.required || [],
    },
  }));
}

/**
 * Convert generic messages to Gemini's contents format.
 * Gemini uses: { role: 'user' | 'model' | 'function', parts: [...] }
 */
function toGeminiContents(messages: Message[], systemPrompt?: string): any[] {
  const contents: any[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;

    if (msg.role === 'user') {
      let text = msg.text || '';
      // Prepend system prompt to first user message
      if (i === 0 && systemPrompt) {
        text = systemPrompt + '\n\n---\n\n' + text;
      }
      contents.push({ role: 'user', parts: [{ text }] });
    } else if (msg.role === 'assistant') {
      if (msg.functionCalls && msg.functionCalls.length > 0) {
        contents.push({
          role: 'model',
          parts: msg.functionCalls.map(fc => ({
            functionCall: { name: fc.name, args: fc.args },
          })),
        });
      } else if (msg.text) {
        contents.push({ role: 'model', parts: [{ text: msg.text }] });
      }
    } else if (msg.role === 'tool_result') {
      if (msg.functionResponses && msg.functionResponses.length > 0) {
        contents.push({
          role: 'function',
          parts: msg.functionResponses.map(fr => ({
            functionResponse: { name: fr.name, response: fr.response },
          })),
        });
      }
    }
  }

  return contents;
}

/**
 * Parse Gemini response into our generic LLMResponse.
 */
function parseGeminiResponse(response: any): LLMResponse {
  const functionCalls: FunctionCall[] = [];

  if (response.functionCalls && response.functionCalls.length > 0) {
    for (const fc of response.functionCalls) {
      functionCalls.push({
        name: fc.name,
        args: fc.args || {},
      });
    }
  }

  return {
    text: response.text || undefined,
    functionCalls,
    raw: response,
  };
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly model: string;
  private ai: GoogleGenAI;

  constructor(apiKey: string, model?: string) {
    this.model = model || DEFAULT_MODEL;
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(options: GenerateOptions): Promise<LLMResponse> {
    const contents = toGeminiContents(options.messages, options.systemPrompt);

    const config: any = {
      temperature: options.temperature ?? 0,
    };

    if (options.tools && options.tools.length > 0) {
      config.tools = [{ functionDeclarations: toGeminiFunctionDeclarations(options.tools) }];
    }

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config,
    });

    return parseGeminiResponse(response);
  }
}
