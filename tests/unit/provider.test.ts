/**
 * Provider Tests
 * 
 * Unit tests for AI provider adapters with MOCKED responses.
 * No real API calls are made.
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getProvider,
  isValidProvider,
  getSupportedProviders,
  parseCompileResponse,
  parseGenerateResponse,
  buildCompileUserPrompt,
  buildGenerateUserPrompt,
  formatContext,
  createEmptyContext,
  CallLogger,
  setCallLogger,
  resetCallLogger,
} from "../../src/providers";
import type { CompileRequest, GenerateRequest, NodeContext, CallLogEntry } from "../../src/types";

// =============================================================================
// Test Fixtures
// =============================================================================

const mockContext: NodeContext = {
  module: "server",
  ancestry: ["root", "server"],
  tags: ["api", "rest"],
  interfaces: {
    UserData: {
      source: "root",
      definition: "interface UserData { id: string; name: string; }",
    },
  },
  constraints: [
    { rule: "Must validate all inputs", source: "root", important: true },
    { rule: "Should use async/await", source: "server", important: false },
  ],
  suggestions: [
    { rule: "Consider using dependency injection", source: "root" },
  ],
  utilities: [
    { name: "validateInput", signature: "(data: unknown) => Result", location: "utils/validate.ts", source: "root" },
  ],
  conventions: [
    { rule: "Use camelCase for variables", source: "root", selector: "*" },
  ],
};

const mockCompileRequest: CompileRequest = {
  spec: `server {
    Handles incoming HTTP requests.
    Routes to appropriate handlers.
  }`,
  context: mockContext,
  nodePath: "server",
};

const mockGenerateRequest: GenerateRequest = {
  spec: `logger {
    A simple logging utility.
    Supports info, warn, error levels.
  }`,
  context: createEmptyContext("logger"),
  nodePath: "server/utils/logger",
};

const mockCompileResponseJson = JSON.stringify({
  children: [
    { name: "router", isLeaf: false, spec: "Handles routing logic", tags: ["routing"] },
    { name: "middleware", isLeaf: true, spec: "Request middleware", tags: ["middleware"] },
  ],
  questions: [
    {
      id: "q1",
      question: "What HTTP framework should be used?",
      context: "The spec doesn't specify a framework",
      assumption: "Using native HTTP module",
      impact: "Affects implementation approach",
    },
  ],
  considerations: [
    { id: "c1", note: "Consider adding rate limiting", blocking: false },
  ],
  interfaces: [
    { name: "RequestHandler", definition: "type RequestHandler = (req, res) => void", source: "server" },
  ],
  constraints: [
    { rule: "Must handle errors gracefully", source: "server", important: true },
  ],
  suggestions: [
    { rule: "Consider using middleware pattern", source: "server" },
  ],
  utilities: [],
});

const mockGenerateResponseJson = JSON.stringify({
  files: [
    { path: "server/utils/logger.ts", content: "export function log(msg: string) { console.log(msg); }" },
    { path: "server/utils/logger.test.ts", content: "// Tests for logger" },
  ],
  questions: [],
  considerations: [
    { id: "c1", note: "Consider adding log levels enum", blocking: false },
  ],
});

// =============================================================================
// Response Parsing Tests
// =============================================================================

describe("parseCompileResponse", () => {
  test("parses valid JSON response", () => {
    const result = parseCompileResponse(mockCompileResponseJson);
    
    expect(result.children).toHaveLength(2);
    expect(result.children[0].name).toBe("router");
    expect(result.children[0].isLeaf).toBe(false);
    expect(result.children[1].name).toBe("middleware");
    expect(result.children[1].isLeaf).toBe(true);
    
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question).toContain("HTTP framework");
    
    expect(result.considerations).toHaveLength(1);
    expect(result.interfaces).toHaveLength(1);
    expect(result.constraints).toHaveLength(1);
    expect(result.suggestions).toHaveLength(1);
  });

  test("parses JSON wrapped in markdown code block", () => {
    const wrapped = "```json\n" + mockCompileResponseJson + "\n```";
    const result = parseCompileResponse(wrapped);
    
    expect(result.children).toHaveLength(2);
  });

  test("extracts JSON from mixed content", () => {
    const mixed = "Here is the analysis:\n" + mockCompileResponseJson + "\n\nThat's all!";
    const result = parseCompileResponse(mixed);
    
    expect(result.children).toHaveLength(2);
  });

  test("handles missing optional fields", () => {
    const minimal = JSON.stringify({ children: [] });
    const result = parseCompileResponse(minimal);
    
    expect(result.children).toHaveLength(0);
    expect(result.questions).toHaveLength(0);
    expect(result.interfaces).toHaveLength(0);
  });

  test("throws on invalid JSON", () => {
    expect(() => parseCompileResponse("not json at all")).toThrow();
  });
});

describe("parseGenerateResponse", () => {
  test("parses valid JSON response", () => {
    const result = parseGenerateResponse(mockGenerateResponseJson);
    
    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe("server/utils/logger.ts");
    expect(result.files[0].content).toContain("export function log");
    
    expect(result.questions).toHaveLength(0);
    expect(result.considerations).toHaveLength(1);
  });

  test("handles empty files array", () => {
    const empty = JSON.stringify({ files: [], questions: [], considerations: [] });
    const result = parseGenerateResponse(empty);
    
    expect(result.files).toHaveLength(0);
  });
});

// =============================================================================
// Prompt Building Tests
// =============================================================================

describe("buildCompileUserPrompt", () => {
  test("includes module path", () => {
    const prompt = buildCompileUserPrompt(mockCompileRequest);
    expect(prompt).toContain("Module: server");
  });

  test("includes spec content", () => {
    const prompt = buildCompileUserPrompt(mockCompileRequest);
    expect(prompt).toContain("Handles incoming HTTP requests");
  });

  test("includes context information", () => {
    const prompt = buildCompileUserPrompt(mockCompileRequest);
    expect(prompt).toContain("root > server");
    expect(prompt).toContain("api, rest");
  });
});

describe("buildGenerateUserPrompt", () => {
  test("includes module path", () => {
    const prompt = buildGenerateUserPrompt(mockGenerateRequest);
    expect(prompt).toContain("Module: server/utils/logger");
  });

  test("includes spec content", () => {
    const prompt = buildGenerateUserPrompt(mockGenerateRequest);
    expect(prompt).toContain("logging utility");
  });
});

// =============================================================================
// Context Formatting Tests
// =============================================================================

describe("formatContext", () => {
  test("formats basic module info", () => {
    const formatted = formatContext(mockContext);
    
    expect(formatted).toContain("Module: server");
    expect(formatted).toContain("Ancestry: root > server");
    expect(formatted).toContain("Tags: api, rest");
  });

  test("formats interfaces", () => {
    const formatted = formatContext(mockContext);
    
    expect(formatted).toContain("### Available Interfaces");
    expect(formatted).toContain("UserData");
    expect(formatted).toContain("interface UserData");
  });

  test("formats constraints with importance", () => {
    const formatted = formatContext(mockContext);
    
    expect(formatted).toContain("### Constraints");
    expect(formatted).toContain("[MUST]");
    expect(formatted).toContain("validate all inputs");
    expect(formatted).toContain("[SHOULD]");
  });

  test("formats suggestions", () => {
    const formatted = formatContext(mockContext);
    
    expect(formatted).toContain("### Suggestions");
    expect(formatted).toContain("dependency injection");
  });

  test("formats utilities", () => {
    const formatted = formatContext(mockContext);
    
    expect(formatted).toContain("### Available Utilities");
    expect(formatted).toContain("validateInput");
  });

  test("formats empty context without errors", () => {
    const empty = createEmptyContext("test");
    const formatted = formatContext(empty);
    
    expect(formatted).toContain("Module: test");
    expect(formatted).not.toContain("### Constraints");
  });
});

// =============================================================================
// Provider Factory Tests
// =============================================================================

describe("getProvider", () => {
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    // Set mock API keys for testing
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
  });

  afterEach(() => {
    // Restore original keys
    if (originalAnthropicKey) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalOpenAIKey) {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  test("returns Anthropic provider for 'anthropic'", () => {
    const provider = getProvider("anthropic");
    expect(provider.name).toBe("anthropic");
  });

  test("returns Anthropic provider for 'claude' alias", () => {
    const provider = getProvider("claude");
    expect(provider.name).toBe("anthropic");
  });

  test("returns OpenAI provider for 'openai'", () => {
    const provider = getProvider("openai");
    expect(provider.name).toBe("openai");
  });

  test("returns OpenAI provider for 'gpt' alias", () => {
    const provider = getProvider("gpt");
    expect(provider.name).toBe("openai");
  });

  test("is case-insensitive", () => {
    const provider1 = getProvider("ANTHROPIC");
    const provider2 = getProvider("OpenAI");
    
    expect(provider1.name).toBe("anthropic");
    expect(provider2.name).toBe("openai");
  });

  test("throws for unknown provider", () => {
    expect(() => getProvider("unknown")).toThrow("Unknown provider");
  });

  test("throws without API key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getProvider("anthropic")).toThrow("API key is required");
  });

  test("accepts custom API key in options", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const provider = getProvider("anthropic", { apiKey: "custom-key" });
    expect(provider.name).toBe("anthropic");
  });
});

describe("isValidProvider", () => {
  test("returns true for valid providers", () => {
    expect(isValidProvider("anthropic")).toBe(true);
    expect(isValidProvider("openai")).toBe(true);
    expect(isValidProvider("claude")).toBe(true);
    expect(isValidProvider("gpt")).toBe(true);
  });

  test("returns false for invalid providers", () => {
    expect(isValidProvider("invalid")).toBe(false);
    expect(isValidProvider("")).toBe(false);
  });
});

describe("getSupportedProviders", () => {
  test("returns list of supported providers", () => {
    const providers = getSupportedProviders();
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toHaveLength(2);
  });
});

// =============================================================================
// CallLogger Tests
// =============================================================================

describe("CallLogger", () => {
  const testDir = "/tmp/aidef-test-provider";
  let logger: CallLogger;

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    
    logger = new CallLogger(testDir);
    setCallLogger(logger);
  });

  afterEach(() => {
    resetCallLogger();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test("creates log directory on first write", async () => {
    const logDir = testDir;
    expect(existsSync(join(logDir, "calls.jsonl"))).toBe(false);
    
    await logger.log({
      id: "test-1",
      timestamp: new Date().toISOString(),
      node: "test",
      phase: "compile",
      provider: "test",
      model: "test-model",
      input: "test input",
      output: "test output",
      inputTokens: 10,
      outputTokens: 20,
      durationMs: 100,
      success: true,
    });
    
    expect(existsSync(join(logDir, "calls.jsonl"))).toBe(true);
  });

  test("writes JSONL entries", async () => {
    const entry: CallLogEntry = {
      id: "test-2",
      timestamp: "2024-01-01T00:00:00Z",
      node: "server",
      phase: "compile",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      input: "test input",
      output: "test output",
      inputTokens: 100,
      outputTokens: 200,
      durationMs: 1500,
      success: true,
    };
    
    await logger.log(entry);
    
    const content = readFileSync(join(testDir, "calls.jsonl"), "utf-8");
    const parsed = JSON.parse(content.trim());
    
    expect(parsed.id).toBe("test-2");
    expect(parsed.node).toBe("server");
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.success).toBe(true);
  });

  test("appends multiple entries", async () => {
    await logger.log({
      id: "entry-1",
      timestamp: new Date().toISOString(),
      node: "a",
      phase: "compile",
      provider: "test",
      model: "test",
      input: "input 1",
      output: "output 1",
      inputTokens: 10,
      outputTokens: 20,
      durationMs: 100,
      success: true,
    });
    
    await logger.log({
      id: "entry-2",
      timestamp: new Date().toISOString(),
      node: "b",
      phase: "generate",
      provider: "test",
      model: "test",
      input: "input 2",
      output: "output 2",
      inputTokens: 30,
      outputTokens: 40,
      durationMs: 200,
      success: true,
    });
    
    const content = readFileSync(join(testDir, "calls.jsonl"), "utf-8");
    const lines = content.trim().split("\n");
    
    expect(lines).toHaveLength(2);
    
    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    
    expect(entry1.id).toBe("entry-1");
    expect(entry2.id).toBe("entry-2");
  });

  test("logs failed calls with error", async () => {
    const entry: CallLogEntry = {
      id: "test-error",
      timestamp: new Date().toISOString(),
      node: "failing",
      phase: "compile",
      provider: "test",
      model: "test",
      input: "test input",
      output: "",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 50,
      success: false,
      error: "API rate limit exceeded",
    };
    
    await logger.log(entry);
    
    const content = readFileSync(join(testDir, "calls.jsonl"), "utf-8");
    const parsed = JSON.parse(content.trim());
    
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("API rate limit exceeded");
  });

  test("createEntry fills in defaults", () => {
    const entry = logger.createEntry({
      node: "test",
      phase: "compile",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      input: "in",
      output: "out",
      inputTokens: 10,
      outputTokens: 20,
      durationMs: 100,
      success: true,
    });
    
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(entry.node).toBe("test");
  });
});

// =============================================================================
// Empty Context Helper Tests
// =============================================================================

describe("createEmptyContext", () => {
  test("creates context with module name", () => {
    const ctx = createEmptyContext("myModule");
    
    expect(ctx.module).toBe("myModule");
    expect(ctx.ancestry).toEqual(["myModule"]);
  });

  test("creates empty arrays and objects", () => {
    const ctx = createEmptyContext("test");
    
    expect(ctx.tags).toEqual([]);
    expect(ctx.interfaces).toEqual({});
    expect(ctx.constraints).toEqual([]);
    expect(ctx.suggestions).toEqual([]);
    expect(ctx.utilities).toEqual([]);
    expect(ctx.conventions).toEqual([]);
  });

  test("defaults to 'root' module", () => {
    const ctx = createEmptyContext();
    expect(ctx.module).toBe("root");
  });
});
