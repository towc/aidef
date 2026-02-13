import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { resolve, parseAndResolve } from "../../src/parser/resolver.js";
import { tokenize } from "../../src/parser/lexer.js";
import { parse } from "../../src/parser/ast.js";
import type {
  RootNode,
  ModuleNode,
  ProseNode,
  ImportNode,
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
  // Ensure directory exists
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

describe("Import Resolver", () => {
  // Setup and teardown
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("Simple imports", () => {
    test("resolves simple import: @./other", async () => {
      // Create test files
      await writeTestFile("simple/main.aid", "@./other");
      await writeTestFile(
        "simple/other.aid",
        "server { handles requests }"
      );

      // Parse and resolve
      const mainPath = join(TEST_DIR, "simple/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      // The import should be replaced with the content of other.aid
      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("server");
    });

    test("resolves import with extension: @./other.aid", async () => {
      await writeTestFile("ext/main.aid", "@./other.aid");
      await writeTestFile("ext/other.aid", "api { REST endpoints }");

      const mainPath = join(TEST_DIR, "ext/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("api");
    });

    test("resolves bare name import: @other (without ./)", async () => {
      await writeTestFile("bare/main.aid", "@other");
      await writeTestFile("bare/other.aid", "db { database layer }");

      const mainPath = join(TEST_DIR, "bare/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("db");
    });
  });

  describe("Non-.aid imports (prose)", () => {
    test("imports .md file as prose: @./readme.md", async () => {
      await writeTestFile("prose/main.aid", "@./readme.md");
      await writeTestFile(
        "prose/readme.md",
        "# Project Overview\n\nThis is documentation."
      );

      const mainPath = join(TEST_DIR, "prose/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const prose = findChild<ProseNode>(result.ast.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toContain("# Project Overview");
      expect(prose!.content).toContain("This is documentation");
    });

    test("imports .txt file as prose", async () => {
      await writeTestFile("txt/main.aid", "@./notes.txt");
      await writeTestFile("txt/notes.txt", "Important notes here");

      const mainPath = join(TEST_DIR, "txt/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const prose = findChild<ProseNode>(result.ast.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toBe("Important notes here");
    });

    test("stores non-.aid import in imports map", async () => {
      await writeTestFile("map/main.aid", "@./doc.md");
      await writeTestFile("map/doc.md", "Documentation content");

      const mainPath = join(TEST_DIR, "map/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.imports.size).toBe(1);
      const imp = Array.from(result.imports.values())[0];
      expect(imp.isAidFile).toBe(false);
      expect(imp.content).toBe("Documentation content");
    });
  });

  describe("Scoped imports", () => {
    test("import inside block becomes children of block: server { @./db }", async () => {
      await writeTestFile("scoped/main.aid", "server { @./db }");
      await writeTestFile(
        "scoped/db.aid",
        "Database layer with PostgreSQL"
      );

      const mainPath = join(TEST_DIR, "scoped/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      // The server module should contain the db content as prose
      const server = findChild<ModuleNode>(result.ast.children, "module");
      expect(server).toBeDefined();
      expect(server!.name).toBe("server");

      // The import content should be inside server
      const prose = findChild<ProseNode>(server!.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toContain("Database");
    });

    test("import inside nested block", async () => {
      await writeTestFile(
        "nested-scope/main.aid",
        "app { server { @./api } }"
      );
      await writeTestFile(
        "nested-scope/api.aid",
        "REST API endpoints"
      );

      const mainPath = join(TEST_DIR, "nested-scope/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const app = findChild<ModuleNode>(result.ast.children, "module");
      expect(app!.name).toBe("app");

      const server = findChild<ModuleNode>(app!.children, "module");
      expect(server!.name).toBe("server");

      const prose = findChild<ProseNode>(server!.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toContain("REST API");
    });

    test("module import inside block retains structure", async () => {
      await writeTestFile("struct/main.aid", "app { @./services }");
      await writeTestFile(
        "struct/services.aid",
        "api { endpoints } db { storage }"
      );

      const mainPath = join(TEST_DIR, "struct/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const app = findChild<ModuleNode>(result.ast.children, "module");
      expect(app!.name).toBe("app");

      // api and db should be children of app
      const modules = findAllChildren<ModuleNode>(app!.children, "module");
      expect(modules).toHaveLength(2);
      expect(modules.map((m) => m.name)).toContain("api");
      expect(modules.map((m) => m.name)).toContain("db");
    });
  });

  describe("Nested imports (file imports file)", () => {
    test("resolves chained imports: a -> b -> c", async () => {
      await writeTestFile("chain/a.aid", "@./b");
      await writeTestFile("chain/b.aid", "@./c");
      await writeTestFile("chain/c.aid", "final { content }");

      const mainPath = join(TEST_DIR, "chain/a.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      // All imports should be in the map
      expect(result.imports.size).toBe(2);

      // The final module should be in the AST
      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("final");
    });

    test("resolves multiple nested imports", async () => {
      await writeTestFile(
        "multi-nest/main.aid",
        "@./types\n@./utils\napp { @./services }"
      );
      await writeTestFile("multi-nest/types.aid", "Types { type definitions }");
      await writeTestFile("multi-nest/utils.aid", "Utils { helper functions }");
      await writeTestFile(
        "multi-nest/services.aid",
        "@./db\napi { endpoints }"
      );
      await writeTestFile("multi-nest/db.aid", "database { storage }");

      const mainPath = join(TEST_DIR, "multi-nest/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      // Should have all imports
      expect(result.imports.size).toBe(4);

      // Check structure
      const modules = findAllChildren<ModuleNode>(result.ast.children, "module");
      const moduleNames = modules.map((m) => m.name);
      expect(moduleNames).toContain("Types");
      expect(moduleNames).toContain("Utils");
      expect(moduleNames).toContain("app");
    });

    test("resolves imports from subdirectories", async () => {
      await writeTestFile("subdir/main.aid", "@./lib/helpers");
      await writeTestFile(
        "subdir/lib/helpers.aid",
        "helpers { utility functions }"
      );

      const mainPath = join(TEST_DIR, "subdir/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("helpers");
    });

    test("resolves parent directory imports", async () => {
      await writeTestFile("parent/shared/types.aid", "types { shared types }");
      await writeTestFile("parent/app/main.aid", "@../shared/types");

      const mainPath = join(TEST_DIR, "parent/app/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("types");
    });
  });

  describe("Circular import detection", () => {
    test("detects direct circular import: a -> a", async () => {
      await writeTestFile("circular-self/a.aid", "@./a");

      const mainPath = join(TEST_DIR, "circular-self/a.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes("Circular"))).toBe(
        true
      );
    });

    test("detects two-file circular import: a -> b -> a", async () => {
      await writeTestFile("circular2/a.aid", "@./b");
      await writeTestFile("circular2/b.aid", "@./a");

      const mainPath = join(TEST_DIR, "circular2/a.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes("Circular"))).toBe(
        true
      );
    });

    test("detects three-file circular import: a -> b -> c -> a", async () => {
      await writeTestFile("circular3/a.aid", "@./b");
      await writeTestFile("circular3/b.aid", "@./c");
      await writeTestFile("circular3/c.aid", "@./a");

      const mainPath = join(TEST_DIR, "circular3/a.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes("Circular"))).toBe(
        true
      );
    });

    test("allows diamond imports (a -> b, a -> c, b -> d, c -> d)", async () => {
      await writeTestFile("diamond/a.aid", "@./b\n@./c");
      await writeTestFile("diamond/b.aid", "@./d");
      await writeTestFile("diamond/c.aid", "@./d");
      await writeTestFile("diamond/d.aid", "shared { common module }");

      const mainPath = join(TEST_DIR, "diamond/a.aid");
      const result = await parseAndResolve(mainPath);

      // Diamond should not be considered circular
      expect(
        result.errors.filter((e) => e.message.includes("Circular"))
      ).toHaveLength(0);

      // d should be imported only once but content appears twice
      // (content is duplicated but no circular error)
      const modules = findAllChildren<ModuleNode>(result.ast.children, "module");
      expect(modules.filter((m) => m.name === "shared").length).toBe(2);
    });
  });

  describe("Missing file errors", () => {
    test("errors on missing import file", async () => {
      await writeTestFile("missing/main.aid", "@./nonexistent");

      const mainPath = join(TEST_DIR, "missing/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) => e.message.includes("Failed to read"))
      ).toBe(true);
    });

    test("continues parsing after missing file error", async () => {
      await writeTestFile(
        "missing-continue/main.aid",
        "@./nonexistent\nserver { valid content }"
      );

      const mainPath = join(TEST_DIR, "missing-continue/main.aid");
      const result = await parseAndResolve(mainPath);

      // Should have error for missing file
      expect(result.errors.length).toBeGreaterThan(0);

      // But should still parse the rest
      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("server");
    });

    test("handles multiple missing files gracefully", async () => {
      await writeTestFile(
        "multi-missing/main.aid",
        "@./a\n@./b\n@./c\nvalid { content }"
      );

      const mainPath = join(TEST_DIR, "multi-missing/main.aid");
      const result = await parseAndResolve(mainPath);

      // Should have 3 missing file errors
      const missingErrors = result.errors.filter((e) =>
        e.message.includes("Failed to read")
      );
      expect(missingErrors.length).toBe(3);

      // But still parse valid content
      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
    });
  });

  describe("URL import errors", () => {
    test("errors on http:// URL import", async () => {
      await writeTestFile("url-http/main.aid", "@http://example.com/spec.aid");

      const mainPath = join(TEST_DIR, "url-http/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) =>
          e.message.includes("URL imports not yet supported")
        )
      ).toBe(true);
    });

    test("errors on https:// URL import", async () => {
      await writeTestFile("url-https/main.aid", "@https://example.com/spec.aid");

      const mainPath = join(TEST_DIR, "url-https/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) =>
          e.message.includes("URL imports not yet supported")
        )
      ).toBe(true);
    });

    test("continues after URL import error", async () => {
      await writeTestFile(
        "url-continue/main.aid",
        "@https://example.com/x.aid\nserver { content }"
      );

      const mainPath = join(TEST_DIR, "url-continue/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors.length).toBeGreaterThan(0);

      // Should still parse local content
      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("server");
    });
  });

  describe("Import map tracking", () => {
    test("stores all resolved imports in the map", async () => {
      await writeTestFile("map-all/main.aid", "@./a\n@./b");
      await writeTestFile("map-all/a.aid", "moduleA { }");
      await writeTestFile("map-all/b.aid", "moduleB { }");

      const mainPath = join(TEST_DIR, "map-all/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.imports.size).toBe(2);

      for (const [path, imp] of result.imports) {
        expect(imp.resolvedPath).toBe(path);
        expect(imp.isAidFile).toBe(true);
        expect(imp.ast).toBeDefined();
      }
    });

    test("stores original path in resolved import", async () => {
      await writeTestFile("orig-path/main.aid", "@./subdir/file");
      await writeTestFile("orig-path/subdir/file.aid", "content { }");

      const mainPath = join(TEST_DIR, "orig-path/main.aid");
      const result = await parseAndResolve(mainPath);

      const imp = Array.from(result.imports.values())[0];
      expect(imp.originalPath).toBe("./subdir/file");
    });
  });

  describe("resolve() function (with pre-parsed AST)", () => {
    test("resolves imports from pre-parsed AST", async () => {
      await writeTestFile("pre-parsed/other.aid", "other { module content }");

      const source = "@./other";
      const { ast } = parseSource(source, "test.aid");

      const basePath = join(TEST_DIR, "pre-parsed");
      const result = await resolve(ast, basePath);

      expect(result.errors).toHaveLength(0);

      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("other");
    });
  });

  describe("Edge cases", () => {
    test("handles empty imported file", async () => {
      await writeTestFile("empty-import/main.aid", "@./empty");
      await writeTestFile("empty-import/empty.aid", "");

      const mainPath = join(TEST_DIR, "empty-import/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);
      expect(result.ast.children).toHaveLength(0);
    });

    test("handles import with only whitespace", async () => {
      await writeTestFile("whitespace-import/main.aid", "@./ws");
      await writeTestFile("whitespace-import/ws.aid", "   \n\n   ");

      const mainPath = join(TEST_DIR, "whitespace-import/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);
    });

    test("handles file with only imports", async () => {
      await writeTestFile("only-imports/main.aid", "@./a\n@./b\n@./c");
      await writeTestFile("only-imports/a.aid", "a { }");
      await writeTestFile("only-imports/b.aid", "b { }");
      await writeTestFile("only-imports/c.aid", "c { }");

      const mainPath = join(TEST_DIR, "only-imports/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const modules = findAllChildren<ModuleNode>(result.ast.children, "module");
      expect(modules).toHaveLength(3);
    });

    test("preserves prose content alongside imports", async () => {
      await writeTestFile(
        "prose-imports/main.aid",
        "intro text\n@./module\noutro text"
      );
      await writeTestFile("prose-imports/module.aid", "imported { }");

      const mainPath = join(TEST_DIR, "prose-imports/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      const proseNodes = findAllChildren<ProseNode>(result.ast.children, "prose");
      expect(proseNodes.length).toBeGreaterThan(0);

      const module = findChild<ModuleNode>(result.ast.children, "module");
      expect(module).toBeDefined();
    });

    test("handles deeply nested imports in blocks", async () => {
      await writeTestFile(
        "deep-nest/main.aid",
        "a { b { c { @./inner } } }"
      );
      await writeTestFile("deep-nest/inner.aid", "inner { deepest content }");

      const mainPath = join(TEST_DIR, "deep-nest/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors).toHaveLength(0);

      // Navigate to find the inner module
      const a = findChild<ModuleNode>(result.ast.children, "module");
      expect(a!.name).toBe("a");

      const b = findChild<ModuleNode>(a!.children, "module");
      expect(b!.name).toBe("b");

      const c = findChild<ModuleNode>(b!.children, "module");
      expect(c!.name).toBe("c");

      const inner = findChild<ModuleNode>(c!.children, "module");
      expect(inner!.name).toBe("inner");
    });
  });

  describe("parseAndResolve error handling", () => {
    test("returns error for non-existent root file", async () => {
      const result = await parseAndResolve("/tmp/nonexistent-file-12345.aid");

      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) => e.message.includes("Failed to read"))
      ).toBe(true);
      expect(result.ast.type).toBe("root");
      expect(result.ast.children).toHaveLength(0);
    });

    test("collects lexer errors", async () => {
      // Create a file with unclosed code block (lexer error)
      await writeTestFile("lexer-err/main.aid", "server { ```unclosed }");

      const mainPath = join(TEST_DIR, "lexer-err/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("collects parse errors", async () => {
      // Create a file with unclosed brace (parse error)
      await writeTestFile("parse-err/main.aid", "server { api {");

      const mainPath = join(TEST_DIR, "parse-err/main.aid");
      const result = await parseAndResolve(mainPath);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) => e.message.includes("Expected closing brace"))
      ).toBe(true);
    });
  });
});
