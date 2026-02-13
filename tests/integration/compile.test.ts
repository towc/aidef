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
  createRootContext,
  buildNodePath,
  writePlanFile,
  writeQuestionsFile,
  readPlanFile,
  readQuestionsFile,
} from "../../src/compiler";
import type {
  Provider,
  CompileRequest,
  CompileResult,
  GenerateRequest,
  GenerateResult,
  ChildContext,
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
 * 
 * In the new model, CompileResult.children includes context for each child
 * (parent decides what each child receives).
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
        context: {
          // Parent decides what child receives
          interfaces: {
            DataHandler: {
              definition: "interface DataHandler { handle(data: unknown): void; }",
              source: "server",
            },
          },
          constraints: [
            { rule: "Must validate all input", source: "server" },
          ],
          utilities: [],
        },
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
    // These are what THIS node declares (for tracking/source maps)
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

/**
 * Create a mock ChildContext (what parent passes to child).
 */
function createMockContext(): ChildContext {
  return {
    interfaces: {
      Config: {
        definition: "interface Config { port: number; }",
        source: "root",
      },
    },
    constraints: [
      { rule: "Must be type-safe", source: "root" },
    ],
    utilities: [],
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
    test("creates empty root context (no arguments)", () => {
      // New API: createRootContext takes no arguments
      const context = createRootContext();

      expect(context.interfaces).toEqual({});
      expect(context.constraints).toEqual([]);
      expect(context.utilities).toEqual([]);
      // New model has no module, ancestry, parameters, suggestions, queryFilters
      expect(context).not.toHaveProperty("module");
      expect(context).not.toHaveProperty("ancestry");
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

  describe("writePlanFile / readPlanFile", () => {
    test("writes and reads .plan.aid file for root", async () => {
      const spec = "server {\n  Handles requests.\n}";

      await writePlanFile(testDir, "root", spec);

      const filePath = join(testDir, "root.plan.aid");
      expect(existsSync(filePath)).toBe(true);

      const content = await readPlanFile(testDir, "root");
      expect(content).toBe(spec);
    });

    test("writes and reads .plan.aid file for nested node", async () => {
      const spec = "api {\n  REST API endpoints.\n}";

      await writePlanFile(testDir, "server/api", spec);

      const filePath = join(testDir, "server/api/node.plan.aid");
      expect(existsSync(filePath)).toBe(true);

      const content = await readPlanFile(testDir, "server/api");
      expect(content).toBe(spec);
    });

    test("returns null for non-existent file", async () => {
      const content = await readPlanFile(testDir, "nonexistent");
      expect(content).toBeNull();
    });
  });

  // Note: context file tests removed.
  // Context is now passed in-memory from parent to child via ChildSpec.context.

  describe("writeQuestionsFile / readQuestionsFile", () => {
    test("writes and reads .plan.aid.questions.json file", async () => {
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

      await writeQuestionsFile(testDir, "root", questions);

      const filePath = join(testDir, "root.plan.aid.questions.json");
      expect(existsSync(filePath)).toBe(true);

      const readQuestions = await readQuestionsFile(testDir, "root");
      expect(readQuestions).not.toBeNull();
      expect(readQuestions!.module).toBe("server");
      expect(readQuestions!.questions).toHaveLength(1);
      expect(readQuestions!.questions[0].question).toBe("What framework?");
    });

    test("returns null for non-existent .plan.aid.questions.json file", async () => {
      const questions = await readQuestionsFile(testDir, "nonexistent");
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
      const context = createMockContext();

      const result = await compileNode(node, context, provider, testDir);

      // Check result
      expect(result.nodePath).toBe("server");
      expect(result.isLeaf).toBe(false);
      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe("submodule");
      // Children should have their own context (from parent/AI)
      expect(result.children[0].context).toBeDefined();
      expect(result.children[0].context.interfaces.DataHandler).toBeDefined();
      expect(result.questions).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      // Check .plan.aid file was written
      const spec = await readPlanFile(testDir, "server");
      expect(spec).not.toBeNull();
      expect(spec).toContain("server");

      // Note: context files are no longer written in the new model
      // Context is passed in-memory via ChildSpec.context

      // Check .plan.aid.questions.json file was written (since mock has questions)
      const questions = await readQuestionsFile(testDir, "server");
      expect(questions).not.toBeNull();
      expect(questions!.questions).toHaveLength(1);
    });

    test("handles leaf node (no children from provider)", async () => {
      const provider = createLeafProvider();
      const node = createMockModuleNode();
      const context = createMockContext();

      const result = await compileNode(node, context, provider, testDir);

      expect(result.isLeaf).toBe(true);
      expect(result.children).toHaveLength(0);
    });

    test("children receive context from parent (new model)", async () => {
      const provider = createMockProvider();
      const node = createMockModuleNode();
      const context = createMockContext();

      const result = await compileNode(node, context, provider, testDir);

      // In the new model, each child has its context set by the AI/parent
      // The mock provider sets up context on each child
      expect(result.children).toHaveLength(1);
      const childContext = result.children[0].context;
      
      // Child should have what parent decided to pass
      expect(childContext.interfaces.DataHandler).toBeDefined();
      expect(childContext.constraints).toHaveLength(1);
      expect(childContext.constraints[0].rule).toBe("Must validate all input");
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
      const context = createMockContext();

      const result = await compileNode(
        node,
        context,
        errorProvider,
        testDir
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Provider compilation failed");
      expect(result.isLeaf).toBe(true); // Treat as leaf on error
    });
  });

  describe("compileRootNode", () => {
    test("compiles root node with proper path (new signature)", async () => {
      const provider = createMockProvider();
      const rootNode = createMockRootNode();

      // New signature: compileRootNode(rootNode, provider, outputDir, options?)
      // No context parameter - it creates empty context internally
      const result = await compileRootNode(
        rootNode,
        provider,
        testDir
      );

      expect(result.nodePath).toBe("root");

      // Check root.plan.aid was written
      const spec = await readPlanFile(testDir, "root");
      expect(spec).not.toBeNull();

      // Note: context files are no longer written in the new model
      // Context is passed in-memory
    });

    test("returns children with their contexts", async () => {
      const provider = createMockProvider();
      const rootNode = createMockRootNode();

      const result = await compileRootNode(rootNode, provider, testDir);

      // Children should have their context set
      expect(result.children).toHaveLength(1);
      expect(result.children[0].context).toBeDefined();
    });
  });

  // ===========================================================================
  // File Structure Tests
  // ===========================================================================

  describe("File Structure", () => {
    test("creates correct directory structure for nested nodes", async () => {
      const provider = createMockProvider();
      const parentContext = createMockContext();

      // Compile server node
      const serverNode = createMockModuleNode();
      const serverResult = await compileNode(serverNode, parentContext, provider, testDir);

      // In the new model, child context comes from the compile result
      // Get context from the first child (or create a simple one for api)
      const apiContext: ChildContext = serverResult.children.length > 0
        ? serverResult.children[0].context
        : createMockContext();
      
      // Create and compile api node
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

      await compileNode(apiNode, apiContext, provider, testDir);

      // Verify directory structure (.plan.aid files only, no context files)
      expect(existsSync(join(testDir, "server"))).toBe(true);
      expect(existsSync(join(testDir, "server/node.plan.aid"))).toBe(true);
      // Note: context files are no longer written in the new model
      expect(existsSync(join(testDir, "api"))).toBe(true);
      expect(existsSync(join(testDir, "api/node.plan.aid"))).toBe(true);
    });
  });
});
