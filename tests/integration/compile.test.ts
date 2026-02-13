/**
 * Compiler Integration Tests
 *
 * Tests the compilation flow with MOCKED provider responses.
 * No real API calls are made.
 * 
 * Updated for nginx-like syntax.
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import { existsSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  compileNode,
  compileRootNode,
  buildChildContext,
  createRootContext,
  buildNodePath,
  writeAidgFile,
  writeAidcFile,
  writeAidqFile,
  readAidgFile,
  readAidcFile,
  readAidqFile,
} from "../../src/compiler";
import type {
  Provider,
  CompileRequest,
  CompileResult,
  GenerateRequest,
  GenerateResult,
  NodeContext,
  NodeQuestions,
  RootNode,
  ModuleNode,
  ProseNode,
  ASTNode,
} from "../../src/types";

// =============================================================================
// Mock Provider
// =============================================================================

/**
 * Create a mock provider that returns predictable responses.
 */
function createMockProvider(
  mockCompileResult?: Partial<CompileResult>
): Provider {
  const defaultCompileResult: CompileResult = {
    children: [
      {
        name: "submodule",
        isLeaf: true,
        spec: "A simple submodule that handles data processing.",
      },
    ],
    questions: [
      {
        id: "q1",
        question: "What data format should be used?",
        context: "The spec doesn't specify a format",
        assumption: "Using JSON format",
        impact: "Affects serialization logic",
      },
    ],
    considerations: [
      {
        id: "c1",
        note: "Consider adding validation",
        blocking: false,
      },
    ],
    interfaces: [
      {
        name: "DataHandler",
        definition: "interface DataHandler { handle(data: unknown): void; }",
        source: "server",
      },
    ],
    constraints: [
      {
        rule: "Must validate all input",
        source: "server",
      },
    ],
    suggestions: [
      {
        rule: "Consider using streaming for large data",
        source: "server",
      },
    ],
    utilities: [
      {
        name: "parseData",
        signature: "(raw: string) => Data",
        location: "utils/parser.ts",
        source: "server",
      },
    ],
  };

  return {
    name: "mock",

    async compile(request: CompileRequest): Promise<CompileResult> {
      return { ...defaultCompileResult, ...mockCompileResult };
    },

    async generate(request: GenerateRequest): Promise<GenerateResult> {
      return {
        files: [
          {
            path: `${request.nodePath}/index.ts`,
            content: "// Generated code\nexport {}",
          },
        ],
        questions: [],
        considerations: [],
      };
    },

    async testConnection(): Promise<boolean> {
      return true;
    },
  };
}

/**
 * Create a mock provider that returns no children (leaf node).
 */
function createLeafProvider(): Provider {
  return createMockProvider({
    children: [],
    questions: [],
    considerations: [],
    interfaces: [],
    constraints: [],
    suggestions: [],
    utilities: [],
  });
}

// =============================================================================
// Test Fixtures (nginx-like syntax)
// =============================================================================

function createMockRootNode(): RootNode {
  return {
    type: "root",
    children: [
      {
        type: "prose",
        content: "A server application that handles requests.",
        source: {
          start: { file: "test.aid", line: 1, column: 1, offset: 0 },
          end: { file: "test.aid", line: 1, column: 40, offset: 40 },
        },
      } as ProseNode,
      {
        type: "module",
        name: "server",
        parameters: [],
        children: [
          {
            type: "prose",
            content: "Handles HTTP requests.",
            source: {
              start: { file: "test.aid", line: 3, column: 3, offset: 50 },
              end: { file: "test.aid", line: 3, column: 25, offset: 72 },
            },
          } as ProseNode,
        ],
        source: {
          start: { file: "test.aid", line: 2, column: 1, offset: 42 },
          end: { file: "test.aid", line: 4, column: 1, offset: 80 },
        },
      } as ModuleNode,
    ],
    source: {
      start: { file: "test.aid", line: 1, column: 1, offset: 0 },
      end: { file: "test.aid", line: 5, column: 1, offset: 100 },
    },
  };
}

function createMockModuleNode(): ModuleNode {
  return {
    type: "module",
    name: "server",
    parameters: [
      {
        type: "parameter",
        name: "priority",
        value: 1,
        source: {
          start: { file: "test.aid", line: 1, column: 10, offset: 10 },
          end: { file: "test.aid", line: 1, column: 20, offset: 20 },
        },
      },
    ],
    children: [
      {
        type: "prose",
        content: "A server that handles HTTP requests and routes them.",
        source: {
          start: { file: "test.aid", line: 2, column: 3, offset: 20 },
          end: { file: "test.aid", line: 2, column: 55, offset: 72 },
        },
      } as ProseNode,
    ],
    source: {
      start: { file: "test.aid", line: 1, column: 1, offset: 0 },
      end: { file: "test.aid", line: 3, column: 1, offset: 80 },
    },
  };
}

function createMockParentContext(): NodeContext {
  return {
    module: "root",
    ancestry: ["root"],
    parameters: {},
    interfaces: {
      Config: {
        source: "root",
        definition: "interface Config { port: number; }",
      },
    },
    constraints: [
      { rule: "Must be type-safe", source: "root" },
    ],
    suggestions: [{ rule: "Use async/await", source: "root" }],
    utilities: [],
    queryFilters: [],
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe("Compiler Integration", () => {
  const testDir = "/tmp/aidef-test-compile";

  beforeEach(async () => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  // ===========================================================================
  // Context Builder Tests
  // ===========================================================================

  describe("createRootContext", () => {
    test("creates empty root context", () => {
      const rootNode = createMockRootNode();
      const context = createRootContext(rootNode);

      expect(context.module).toBe("root");
      expect(context.ancestry).toEqual(["root"]);
      expect(context.parameters).toEqual({});
      expect(context.interfaces).toEqual({});
      expect(context.constraints).toEqual([]);
      expect(context.suggestions).toEqual([]);
      expect(context.utilities).toEqual([]);
      expect(context.queryFilters).toEqual([]);
    });
  });

  describe("buildChildContext", () => {
    test("merges parent context with compile result", () => {
      const parentContext = createMockParentContext();
      const compileResult: CompileResult = {
        children: [],
        questions: [],
        considerations: [],
        interfaces: [
          {
            name: "Handler",
            definition: "interface Handler { handle(): void; }",
            source: "server",
          },
        ],
        constraints: [
          { rule: "Must handle errors", source: "server" },
        ],
        suggestions: [{ rule: "Use middleware", source: "server" }],
        utilities: [
          {
            name: "logger",
            signature: "(msg: string) => void",
            location: "utils/logger.ts",
            source: "server",
          },
        ],
      };

      const childContext = buildChildContext(
        parentContext,
        compileResult,
        "server"
      );

      // Check ancestry is extended
      expect(childContext.ancestry).toEqual(["root", "server"]);
      expect(childContext.module).toBe("server");

      // Check interfaces are merged
      expect(childContext.interfaces.Config).toBeDefined();
      expect(childContext.interfaces.Handler).toBeDefined();

      // Check constraints are merged
      expect(childContext.constraints).toHaveLength(2);
      expect(childContext.constraints[0].rule).toBe("Must be type-safe");
      expect(childContext.constraints[1].rule).toBe("Must handle errors");

      // Check suggestions are merged
      expect(childContext.suggestions).toHaveLength(2);

      // Check utilities are merged
      expect(childContext.utilities).toHaveLength(1);

      // Check queryFilters are preserved
      expect(childContext.queryFilters).toHaveLength(0);
    });

    test("preserves parent queryFilters", () => {
      const parentContext = createMockParentContext();
      parentContext.queryFilters = [
        { question: "Is this a database?", content: "Database config" },
      ];

      const compileResult: CompileResult = {
        children: [],
        questions: [],
        considerations: [],
        interfaces: [],
        constraints: [],
        suggestions: [],
        utilities: [],
      };

      const childContext = buildChildContext(
        parentContext,
        compileResult,
        "server"
      );

      // Should preserve parent queryFilters
      expect(childContext.queryFilters).toHaveLength(1);
      expect(childContext.queryFilters[0].question).toBe("Is this a database?");
    });
  });

  describe("buildNodePath", () => {
    test("returns 'root' for root ancestry", () => {
      expect(buildNodePath(["root"])).toBe("root");
    });

    test("builds path from ancestry", () => {
      expect(buildNodePath(["root", "server"])).toBe("server");
      expect(buildNodePath(["root", "server", "api"])).toBe("server/api");
      expect(buildNodePath(["root", "server", "api", "users"])).toBe(
        "server/api/users"
      );
    });
  });

  // ===========================================================================
  // Writer Tests
  // ===========================================================================

  describe("writeAidgFile / readAidgFile", () => {
    test("writes and reads .aidg file for root", async () => {
      const spec = "server {\n  Handles requests.\n}";

      await writeAidgFile(testDir, "root", spec);

      const filePath = join(testDir, "root.aidg");
      expect(existsSync(filePath)).toBe(true);

      const content = await readAidgFile(testDir, "root");
      expect(content).toBe(spec);
    });

    test("writes and reads .aidg file for nested node", async () => {
      const spec = "api {\n  REST API endpoints.\n}";

      await writeAidgFile(testDir, "server/api", spec);

      const filePath = join(testDir, "server/api/node.aidg");
      expect(existsSync(filePath)).toBe(true);

      const content = await readAidgFile(testDir, "server/api");
      expect(content).toBe(spec);
    });

    test("returns null for non-existent file", async () => {
      const content = await readAidgFile(testDir, "nonexistent");
      expect(content).toBeNull();
    });
  });

  describe("writeAidcFile / readAidcFile", () => {
    test("writes and reads .aidc file", async () => {
      const context = createMockParentContext();

      await writeAidcFile(testDir, "root", context);

      const filePath = join(testDir, "root.aidc");
      expect(existsSync(filePath)).toBe(true);

      const readContext = await readAidcFile(testDir, "root");
      expect(readContext).not.toBeNull();
      expect(readContext!.module).toBe("root");
      expect(readContext!.interfaces.Config).toBeDefined();
    });

    test("writes nested .aidc file", async () => {
      const context: NodeContext = {
        module: "api",
        ancestry: ["root", "server", "api"],
        parameters: {},
        interfaces: {},
        constraints: [],
        suggestions: [],
        utilities: [],
        queryFilters: [],
      };

      await writeAidcFile(testDir, "server/api", context);

      const filePath = join(testDir, "server/api/node.aidc");
      expect(existsSync(filePath)).toBe(true);

      const readContext = await readAidcFile(testDir, "server/api");
      expect(readContext!.module).toBe("api");
      expect(readContext!.ancestry).toEqual(["root", "server", "api"]);
    });
  });

  describe("writeAidqFile / readAidqFile", () => {
    test("writes and reads .aidq file", async () => {
      const questions: NodeQuestions = {
        module: "server",
        questions: [
          {
            id: "q1",
            question: "What framework?",
            context: "Not specified",
            assumption: "Express",
            impact: "Affects routing",
          },
        ],
        considerations: [
          {
            id: "c1",
            note: "Add rate limiting",
            blocking: false,
          },
        ],
      };

      await writeAidqFile(testDir, "root", questions);

      const filePath = join(testDir, "root.aidq");
      expect(existsSync(filePath)).toBe(true);

      const readQuestions = await readAidqFile(testDir, "root");
      expect(readQuestions).not.toBeNull();
      expect(readQuestions!.module).toBe("server");
      expect(readQuestions!.questions).toHaveLength(1);
      expect(readQuestions!.questions[0].question).toBe("What framework?");
    });

    test("returns null for non-existent .aidq file", async () => {
      const questions = await readAidqFile(testDir, "nonexistent");
      expect(questions).toBeNull();
    });
  });

  // ===========================================================================
  // Compile Node Tests
  // ===========================================================================

  describe("compileNode", () => {
    test("compiles a module node and writes files", async () => {
      const provider = createMockProvider();
      const node = createMockModuleNode();
      const parentContext = createMockParentContext();

      const result = await compileNode(node, parentContext, provider, testDir);

      // Check result
      expect(result.nodePath).toBe("server");
      expect(result.isLeaf).toBe(false);
      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe("submodule");
      expect(result.questions).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      // Check .aidg file was written
      const spec = await readAidgFile(testDir, "server");
      expect(spec).not.toBeNull();
      expect(spec).toContain("server");

      // Check .aidc file was written
      const context = await readAidcFile(testDir, "server");
      expect(context).not.toBeNull();
      expect(context!.module).toBe("server");
      expect(context!.ancestry).toEqual(["root", "server"]);

      // Check .aidq file was written (since mock has questions)
      const questions = await readAidqFile(testDir, "server");
      expect(questions).not.toBeNull();
      expect(questions!.questions).toHaveLength(1);
    });

    test("handles leaf node (no children from provider)", async () => {
      const provider = createLeafProvider();
      const node = createMockModuleNode();
      const parentContext = createMockParentContext();

      const result = await compileNode(node, parentContext, provider, testDir);

      expect(result.isLeaf).toBe(true);
      expect(result.children).toHaveLength(0);
    });

    test("merges compile result into context", async () => {
      const provider = createMockProvider();
      const node = createMockModuleNode();
      const parentContext = createMockParentContext();

      await compileNode(node, parentContext, provider, testDir);

      // Read the context that was written
      const context = await readAidcFile(testDir, "server");

      // Should have parent interfaces plus new ones
      expect(context!.interfaces.Config).toBeDefined();
      expect(context!.interfaces.DataHandler).toBeDefined();

      // Should have parent constraints plus new ones
      expect(context!.constraints.length).toBeGreaterThan(1);
    });

    test("handles provider errors gracefully", async () => {
      const errorProvider: Provider = {
        name: "error-mock",
        async compile(): Promise<CompileResult> {
          throw new Error("Provider failed");
        },
        async generate(): Promise<GenerateResult> {
          throw new Error("Provider failed");
        },
        async testConnection(): Promise<boolean> {
          return false;
        },
      };

      const node = createMockModuleNode();
      const parentContext = createMockParentContext();

      const result = await compileNode(
        node,
        parentContext,
        errorProvider,
        testDir
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Provider compilation failed");
      expect(result.isLeaf).toBe(true); // Treat as leaf on error
    });
  });

  describe("compileRootNode", () => {
    test("compiles root node with proper path", async () => {
      const provider = createMockProvider();
      const rootNode = createMockRootNode();
      const rootContext = createRootContext(rootNode);

      const result = await compileRootNode(
        rootNode,
        rootContext,
        provider,
        testDir
      );

      expect(result.nodePath).toBe("root");

      // Check root.aidg was written
      const spec = await readAidgFile(testDir, "root");
      expect(spec).not.toBeNull();

      // Check root.aidc was written
      const context = await readAidcFile(testDir, "root");
      expect(context).not.toBeNull();
      expect(context!.ancestry).toEqual(["root"]);
    });
  });

  // ===========================================================================
  // File Structure Tests
  // ===========================================================================

  describe("File Structure", () => {
    test("creates correct directory structure for nested nodes", async () => {
      const provider = createMockProvider();
      const parentContext = createMockParentContext();

      // Compile server node
      const serverNode = createMockModuleNode();
      await compileNode(serverNode, parentContext, provider, testDir);

      // Read the context that was written
      const serverContext = await readAidcFile(testDir, "server");
      
      // Create a child context and compile api node
      const apiNode: ModuleNode = {
        type: "module",
        name: "api",
        parameters: [],
        children: [
          {
            type: "prose",
            content: "REST API endpoints.",
            source: {
              start: { file: "test.aid", line: 1, column: 1, offset: 0 },
              end: { file: "test.aid", line: 1, column: 20, offset: 20 },
            },
          } as ProseNode,
        ],
        source: {
          start: { file: "test.aid", line: 1, column: 1, offset: 0 },
          end: { file: "test.aid", line: 2, column: 1, offset: 30 },
        },
      };

      await compileNode(apiNode, serverContext!, provider, testDir);

      // Verify directory structure
      expect(existsSync(join(testDir, "server"))).toBe(true);
      expect(existsSync(join(testDir, "server/node.aidg"))).toBe(true);
      expect(existsSync(join(testDir, "server/node.aidc"))).toBe(true);
      expect(existsSync(join(testDir, "server/api"))).toBe(true);
      expect(existsSync(join(testDir, "server/api/node.aidg"))).toBe(true);
      expect(existsSync(join(testDir, "server/api/node.aidc"))).toBe(true);
    });
  });
});
