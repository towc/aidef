/**
 * Generator Tests
 *
 * Unit tests for the code generation (build) system.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  executeGenerator,
  discoverLeafNodes,
  runBuild,
  type ExecuteResult,
  type LeafNode,
  type BuildResult,
} from "../../src/generator";
import {
  writePlanFile,
  writeContextFile,
} from "../../src/compiler";
import type {
  Provider,
  GenerateRequest,
  GenerateResult,
  CompileRequest,
  CompileResult,
  ChildContext,
} from "../../src/types";
import { EMPTY_CONTEXT } from "../../src/types";

// Test directories in /tmp
const TEST_AID_GEN = "/tmp/aidef-generator-tests/.aid-plan";
const TEST_BUILD = "/tmp/aidef-generator-tests/build";

// =============================================================================
// Mock Provider
// =============================================================================

function createMockProvider(
  mockGenerateResult?: Partial<GenerateResult>
): Provider {
  const defaultResult: GenerateResult = {
    files: [
      { path: "output.ts", content: "export const value = 42;" },
    ],
    questions: [],
    considerations: [],
  };

  return {
    name: "mock",
    async compile(): Promise<CompileResult> {
      return {
        children: [],
        questions: [],
        considerations: [],
        interfaces: [],
        constraints: [],
        utilities: [],
      };
    },
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      return { ...defaultResult, ...mockGenerateResult };
    },
    async testConnection(): Promise<boolean> {
      return true;
    },
  };
}

// =============================================================================
// Test Setup/Teardown
// =============================================================================

function cleanupTestDirs() {
  const baseDir = "/tmp/aidef-generator-tests";
  if (existsSync(baseDir)) {
    rmSync(baseDir, { recursive: true });
  }
}

function setupTestDirs() {
  cleanupTestDirs();
  mkdirSync(TEST_AID_GEN, { recursive: true });
  mkdirSync(TEST_BUILD, { recursive: true });
}

// =============================================================================
// Discover Tests
// =============================================================================

describe("discoverLeafNodes", () => {
  beforeEach(setupTestDirs);
  afterEach(cleanupTestDirs);

  test("finds root leaf node", async () => {
    // Create root leaf node
    await writePlanFile(TEST_AID_GEN, "root", "root { some spec }");
    await writeContextFile(TEST_AID_GEN, "root", EMPTY_CONTEXT);

    const leaves = await discoverLeafNodes(TEST_AID_GEN);

    expect(leaves).toHaveLength(1);
    expect(leaves[0].nodePath).toBe("root");
  });

  test("finds nested leaf nodes", async () => {
    // Create nested leaf node
    const serverDir = join(TEST_AID_GEN, "server");
    mkdirSync(serverDir, { recursive: true });

    await writePlanFile(TEST_AID_GEN, "server", "server { spec }");
    await writeContextFile(TEST_AID_GEN, "server", EMPTY_CONTEXT);

    const leaves = await discoverLeafNodes(TEST_AID_GEN);

    expect(leaves).toHaveLength(1);
    expect(leaves[0].nodePath).toBe("server");
  });

  test("finds deeply nested leaf nodes", async () => {
    // Create deeply nested leaf node
    const apiDir = join(TEST_AID_GEN, "server/api");
    mkdirSync(apiDir, { recursive: true });

    await writePlanFile(TEST_AID_GEN, "server/api", "api { spec }");
    await writeContextFile(TEST_AID_GEN, "server/api", EMPTY_CONTEXT);

    const leaves = await discoverLeafNodes(TEST_AID_GEN);

    expect(leaves).toHaveLength(1);
    expect(leaves[0].nodePath).toBe("server/api");
  });

  test("finds multiple leaf nodes", async () => {
    // Create multiple leaf nodes
    const serverDir = join(TEST_AID_GEN, "server");
    const clientDir = join(TEST_AID_GEN, "client");
    mkdirSync(serverDir, { recursive: true });
    mkdirSync(clientDir, { recursive: true });

    await writePlanFile(TEST_AID_GEN, "server", "server { spec }");
    await writeContextFile(TEST_AID_GEN, "server", EMPTY_CONTEXT);
    await writePlanFile(TEST_AID_GEN, "client", "client { spec }");
    await writeContextFile(TEST_AID_GEN, "client", EMPTY_CONTEXT);

    const leaves = await discoverLeafNodes(TEST_AID_GEN);

    expect(leaves).toHaveLength(2);
    const paths = leaves.map((l) => l.nodePath).sort();
    expect(paths).toEqual(["client", "server"]);
  });

  test("ignores non-leaf nodes (no context file)", async () => {
    // Create node without context file (not a leaf)
    const serverDir = join(TEST_AID_GEN, "server");
    mkdirSync(serverDir, { recursive: true });

    await writePlanFile(TEST_AID_GEN, "server", "server { spec }");
    // No context file - this is not a leaf

    const leaves = await discoverLeafNodes(TEST_AID_GEN);

    expect(leaves).toHaveLength(0);
  });

  test("returns empty array for empty directory", async () => {
    const leaves = await discoverLeafNodes(TEST_AID_GEN);
    expect(leaves).toHaveLength(0);
  });
});

// =============================================================================
// Execute Tests
// =============================================================================

describe("executeGenerator", () => {
  beforeEach(setupTestDirs);
  afterEach(cleanupTestDirs);

  test("generates files from leaf node", async () => {
    // Setup leaf node
    await writePlanFile(TEST_AID_GEN, "root", "root { generate code }");
    await writeContextFile(TEST_AID_GEN, "root", EMPTY_CONTEXT);

    const provider = createMockProvider();
    const result = await executeGenerator(
      "root",
      provider,
      TEST_AID_GEN,
      TEST_BUILD
    );

    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("output.ts");
    expect(result.errors).toHaveLength(0);

    // Check file was written
    const outputPath = join(TEST_BUILD, "output.ts");
    expect(existsSync(outputPath)).toBe(true);
  });

  test("adds source headers to generated files", async () => {
    await writePlanFile(TEST_AID_GEN, "server", "server { code }");
    await writeContextFile(TEST_AID_GEN, "server", EMPTY_CONTEXT);

    const provider = createMockProvider();
    await executeGenerator("server", provider, TEST_AID_GEN, TEST_BUILD, {
      addSourceHeaders: true,
    });

    const outputPath = join(TEST_BUILD, "output.ts");
    const content = readFileSync(outputPath, "utf-8");

    expect(content).toContain("Generated by AIDef");
    expect(content).toContain("server");
    expect(content).toContain("DO NOT EDIT");
  });

  test("returns error when spec file not found", async () => {
    const provider = createMockProvider();
    const result = await executeGenerator(
      "nonexistent",
      provider,
      TEST_AID_GEN,
      TEST_BUILD
    );

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("No .plan.aid file found");
  });

  test("handles provider errors gracefully", async () => {
    await writePlanFile(TEST_AID_GEN, "root", "root { code }");
    await writeContextFile(TEST_AID_GEN, "root", EMPTY_CONTEXT);

    const errorProvider: Provider = {
      name: "error",
      async compile(): Promise<CompileResult> {
        throw new Error("Compile error");
      },
      async generate(): Promise<GenerateResult> {
        throw new Error("Generation failed");
      },
      async testConnection(): Promise<boolean> {
        return false;
      },
    };

    const result = await executeGenerator(
      "root",
      errorProvider,
      TEST_AID_GEN,
      TEST_BUILD
    );

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Provider generation failed");
  });

  test("generates multiple files", async () => {
    await writePlanFile(TEST_AID_GEN, "root", "root { multiple files }");
    await writeContextFile(TEST_AID_GEN, "root", EMPTY_CONTEXT);

    const provider = createMockProvider({
      files: [
        { path: "src/index.ts", content: "export * from './lib';" },
        { path: "src/lib.ts", content: "export const lib = true;" },
        { path: "tests/lib.test.ts", content: "// tests" },
      ],
    });

    const result = await executeGenerator(
      "root",
      provider,
      TEST_AID_GEN,
      TEST_BUILD
    );

    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(3);

    expect(existsSync(join(TEST_BUILD, "src/index.ts"))).toBe(true);
    expect(existsSync(join(TEST_BUILD, "src/lib.ts"))).toBe(true);
    expect(existsSync(join(TEST_BUILD, "tests/lib.test.ts"))).toBe(true);
  });
});

// =============================================================================
// Build Tests
// =============================================================================

describe("runBuild", () => {
  beforeEach(setupTestDirs);
  afterEach(cleanupTestDirs);

  test("builds all leaf nodes", async () => {
    // Setup multiple leaf nodes
    const serverDir = join(TEST_AID_GEN, "server");
    const clientDir = join(TEST_AID_GEN, "client");
    mkdirSync(serverDir, { recursive: true });
    mkdirSync(clientDir, { recursive: true });

    await writePlanFile(TEST_AID_GEN, "server", "server { spec }");
    await writeContextFile(TEST_AID_GEN, "server", EMPTY_CONTEXT);
    await writePlanFile(TEST_AID_GEN, "client", "client { spec }");
    await writeContextFile(TEST_AID_GEN, "client", EMPTY_CONTEXT);

    const provider = createMockProvider();
    const result = await runBuild(provider, TEST_AID_GEN, TEST_BUILD);

    expect(result.totalLeaves).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.files).toHaveLength(2);
  });

  test("returns error when no leaf nodes found", async () => {
    const provider = createMockProvider();
    const result = await runBuild(provider, TEST_AID_GEN, TEST_BUILD);

    expect(result.totalLeaves).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("reports partial failures", async () => {
    // Setup one working and one failing node
    const serverDir = join(TEST_AID_GEN, "server");
    mkdirSync(serverDir, { recursive: true });

    await writePlanFile(TEST_AID_GEN, "server", "server { spec }");
    await writeContextFile(TEST_AID_GEN, "server", EMPTY_CONTEXT);
    // Create leaf marker but no spec for failing node
    await writeContextFile(TEST_AID_GEN, "root", EMPTY_CONTEXT);

    const provider = createMockProvider();
    const result = await runBuild(provider, TEST_AID_GEN, TEST_BUILD);

    expect(result.totalLeaves).toBe(2);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
  });

  test("respects parallelism option", async () => {
    // Setup multiple leaf nodes
    for (let i = 0; i < 10; i++) {
      const dir = join(TEST_AID_GEN, `node${i}`);
      mkdirSync(dir, { recursive: true });
      await writePlanFile(TEST_AID_GEN, `node${i}`, `node${i} { spec }`);
      await writeContextFile(TEST_AID_GEN, `node${i}`, EMPTY_CONTEXT);
    }

    const provider = createMockProvider();
    const result = await runBuild(provider, TEST_AID_GEN, TEST_BUILD, {
      parallelism: 3,
    });

    expect(result.totalLeaves).toBe(10);
    expect(result.successCount).toBe(10);
  });
});
