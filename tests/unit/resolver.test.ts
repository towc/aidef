/**
 * Resolver Tests
 * 
 * Tests for the include statement resolver.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { resolve, parseAndResolve } from "../../src/parser/resolver.js";
import { tokenize } from "../../src/parser/lexer.js";
import { parse } from "../../src/parser/ast.js";
import type {
  RootNode,
  ModuleNode,
  ProseNode,
  IncludeNode,
  ASTNode,
} from "../../src/types/index.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

// Test directory in /tmp
const TEST_DIR = "/tmp/aidef-resolver-tests";

/**
 * Helper to parse source code and return the AST.
 */
function parseSource(source: string, filename = "test.aid") {
  const { tokens } = tokenize(source, filename);
  return parse(tokens, filename);
}

/**
 * Helper to write a test file.
 */
async function writeTestFile(relativePath: string, content: string) {
  const fullPath = join(TEST_DIR, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await Bun.write(fullPath, content);
  return fullPath;
}

/**
 * Helper to find a child of a specific type.
 */
function findChild<T extends ASTNode>(
  children: ASTNode[],
  type: T["type"]
): T | undefined {
  return children.find((c) => c.type === type) as T | undefined;
}

/**
 * Helper to find all children of a specific type.
 */
function findAllChildren<T extends ASTNode>(
  children: ASTNode[],
  type: T["type"]
): T[] {
  return children.filter((c) => c.type === type) as T[];
}

/**
 * Helper to find module by name.
 */
function findModule(children: ASTNode[], name: string): ModuleNode | undefined {
  return children.find(
    (c) => c.type === "module" && (c as ModuleNode).name === name
  ) as ModuleNode | undefined;
}

// Setup and teardown
beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("Resolver", () => {
  describe("Basic include resolution", () => {
    test("resolves simple include", async () => {
      // Create test files
      await writeTestFile("main.aid", 'include ./other;');
      await writeTestFile("other.aid", "Imported content;");
      
      const result = await parseAndResolve(join(TEST_DIR, "main.aid"));
      
      expect(result.errors).toHaveLength(0);
      expect(result.ast.children.length).toBe(1);
      
      const prose = result.ast.children[0] as ProseNode;
      expect(prose.type).toBe("prose");
      expect(prose.content).toContain("Imported content");
    });

    test("resolves include with explicit extension", async () => {
      await writeTestFile("main2.aid", 'include ./other2.aid;');
      await writeTestFile("other2.aid", "Explicit extension;");
      
      const result = await parseAndResolve(join(TEST_DIR, "main2.aid"));
      
      expect(result.errors).toHaveLength(0);
      const prose = findChild<ProseNode>(result.ast.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toContain("Explicit extension");
    });

    test("resolves bare name include", async () => {
      await writeTestFile("main3.aid", 'include other3;');
      await writeTestFile("other3.aid", "Bare name import;");
      
      const result = await parseAndResolve(join(TEST_DIR, "main3.aid"));
      
      expect(result.errors).toHaveLength(0);
      const prose = findChild<ProseNode>(result.ast.children, "prose");
      expect(prose).toBeDefined();
    });
  });

  describe("Non-.aid file imports", () => {
    test("inlines markdown as prose", async () => {
      await writeTestFile("main-md.aid", 'include ./readme.md;');
      await writeTestFile("readme.md", "# Readme\n\nThis is markdown.");
      
      const result = await parseAndResolve(join(TEST_DIR, "main-md.aid"));
      
      expect(result.errors).toHaveLength(0);
      const prose = findChild<ProseNode>(result.ast.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toContain("# Readme");
    });

    test("inlines text file as prose", async () => {
      await writeTestFile("main-txt.aid", 'include ./notes.txt;');
      await writeTestFile("notes.txt", "Plain text notes");
      
      const result = await parseAndResolve(join(TEST_DIR, "main-txt.aid"));
      
      expect(result.errors).toHaveLength(0);
      const prose = findChild<ProseNode>(result.ast.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toContain("Plain text notes");
    });
  });

  describe("Scoped includes", () => {
    test("includes inside module become children", async () => {
      await writeTestFile("main-scoped.aid", `
server {
  include ./server-details;
}`);
      await writeTestFile("server-details.aid", "Server configuration details;");
      
      const result = await parseAndResolve(join(TEST_DIR, "main-scoped.aid"));
      
      expect(result.errors).toHaveLength(0);
      const server = findModule(result.ast.children, "server");
      expect(server).toBeDefined();
      expect(server!.children.length).toBe(1);
      
      const prose = server!.children[0] as ProseNode;
      expect(prose.content).toContain("Server configuration");
    });
  });

  describe("Nested includes", () => {
    test("resolves file that includes another file", async () => {
      await writeTestFile("a.aid", 'include ./b;');
      await writeTestFile("b.aid", 'include ./c;');
      await writeTestFile("c.aid", "Final content;");
      
      const result = await parseAndResolve(join(TEST_DIR, "a.aid"));
      
      expect(result.errors).toHaveLength(0);
      const prose = findChild<ProseNode>(result.ast.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toContain("Final content");
    });

    test("resolves includes in subdirectories", async () => {
      await writeTestFile("root.aid", 'include ./sub/module;');
      await writeTestFile("sub/module.aid", 'include ./deeper;');
      await writeTestFile("sub/deeper.aid", "Deep content;");
      
      const result = await parseAndResolve(join(TEST_DIR, "root.aid"));
      
      expect(result.errors).toHaveLength(0);
      const prose = findChild<ProseNode>(result.ast.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toContain("Deep content");
    });
  });

  describe("Circular import detection", () => {
    test("detects self-reference", async () => {
      await writeTestFile("circular1.aid", 'include ./circular1;');
      
      const result = await parseAndResolve(join(TEST_DIR, "circular1.aid"));
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Circular");
    });

    test("detects two-file cycle", async () => {
      await writeTestFile("cycle-a.aid", 'include ./cycle-b;');
      await writeTestFile("cycle-b.aid", 'include ./cycle-a;');
      
      const result = await parseAndResolve(join(TEST_DIR, "cycle-a.aid"));
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes("Circular"))).toBe(true);
    });

    test("detects three-file cycle", async () => {
      await writeTestFile("cycle3-a.aid", 'include ./cycle3-b;');
      await writeTestFile("cycle3-b.aid", 'include ./cycle3-c;');
      await writeTestFile("cycle3-c.aid", 'include ./cycle3-a;');
      
      const result = await parseAndResolve(join(TEST_DIR, "cycle3-a.aid"));
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes("Circular"))).toBe(true);
    });

    test("allows diamond pattern (not a cycle)", async () => {
      await writeTestFile("diamond-root.aid", `
include ./diamond-left;
include ./diamond-right;
`);
      await writeTestFile("diamond-left.aid", 'include ./diamond-shared;');
      await writeTestFile("diamond-right.aid", 'include ./diamond-shared;');
      await writeTestFile("diamond-shared.aid", "Shared content;");
      
      const result = await parseAndResolve(join(TEST_DIR, "diamond-root.aid"));
      
      // Should not have circular import errors
      const circularErrors = result.errors.filter(e => 
        e.message.includes("Circular")
      );
      expect(circularErrors).toHaveLength(0);
    });
  });

  describe("Error handling", () => {
    test("reports missing file", async () => {
      await writeTestFile("missing-import.aid", 'include ./nonexistent;');
      
      const result = await parseAndResolve(join(TEST_DIR, "missing-import.aid"));
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Failed to read");
    });

    test("treats URL-like includes as prose (not valid include syntax)", async () => {
      // URL includes like "include https://..." are not valid because:
      // 1. "https" is an identifier (single token), OR
      // 2. The ":" after makes it not look like a path
      // So they get parsed as prose instead of include statements
      await writeTestFile("url-import.aid", 'include https://example.com/file.aid;');
      
      const result = await parseAndResolve(join(TEST_DIR, "url-import.aid"));
      
      // No errors - it's just prose
      expect(result.errors).toHaveLength(0);
      // Content is parsed as prose
      expect(result.ast.children).toHaveLength(1);
      expect(result.ast.children[0].type).toBe("prose");
    });

    test("continues after error", async () => {
      await writeTestFile("continue-after-error.aid", `
include ./missing;
server { }
`);
      
      const result = await parseAndResolve(join(TEST_DIR, "continue-after-error.aid"));
      
      // Should have error for missing file
      expect(result.errors.length).toBeGreaterThan(0);
      
      // But should still parse the server module
      const server = findModule(result.ast.children, "server");
      expect(server).toBeDefined();
    });
  });

  describe("Import map tracking", () => {
    test("tracks resolved imports", async () => {
      await writeTestFile("tracked.aid", 'include ./tracked-other;');
      await writeTestFile("tracked-other.aid", "Tracked content;");
      
      const result = await parseAndResolve(join(TEST_DIR, "tracked.aid"));
      
      expect(result.imports.size).toBe(1);
      const imported = Array.from(result.imports.values())[0];
      expect(imported.isAidFile).toBe(true);
      expect(imported.originalPath).toBe("./tracked-other");
    });

    test("tracks non-.aid imports", async () => {
      await writeTestFile("tracked-md.aid", 'include ./tracked.md;');
      await writeTestFile("tracked.md", "# Title");
      
      const result = await parseAndResolve(join(TEST_DIR, "tracked-md.aid"));
      
      expect(result.imports.size).toBe(1);
      const imported = Array.from(result.imports.values())[0];
      expect(imported.isAidFile).toBe(false);
      expect(imported.content).toContain("# Title");
    });
  });

  describe("Complex resolution", () => {
    test("resolves complex file structure", async () => {
      await writeTestFile("complex/root.aid", `
include ./shared/utils;

server {
  include ./server/config;
  
  api {
    include ./server/routes;
  }
}
`);
      await writeTestFile("complex/shared/utils.aid", "Utility functions;");
      await writeTestFile("complex/server/config.aid", "Server config;");
      await writeTestFile("complex/server/routes.aid", "API routes;");
      
      const result = await parseAndResolve(join(TEST_DIR, "complex/root.aid"));
      
      // Should resolve without circular errors
      const circularErrors = result.errors.filter(e => 
        e.message.includes("Circular")
      );
      expect(circularErrors).toHaveLength(0);
      
      // Should have all imports
      expect(result.imports.size).toBe(3);
    });
  });
});
