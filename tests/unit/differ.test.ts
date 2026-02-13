/**
 * Differ Tests
 *
 * Tests for the caching and diffing system.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  diffNode,
  addCacheMetadata,
  extractCacheMetadata,
  hashContent,
  hashContext,
  summarizeChanges,
  writeAidgFile,
  writeAidcFile,
} from "../../src/compiler";
import type { ChildContext } from "../../src/types";

// Test directory in /tmp
const TEST_DIR = "/tmp/aidef-differ-tests";

/**
 * Create a mock ChildContext for testing.
 */
function createMockContext(overrides: Partial<ChildContext> = {}): ChildContext {
  return {
    interfaces: {},
    constraints: [],
    utilities: [],
    ...overrides,
  };
}

describe("Differ", () => {
  beforeEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("hashContent", () => {
    test("returns consistent hash for same content", () => {
      const content = "server { handles requests }";
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);
      expect(hash1).toBe(hash2);
    });

    test("returns different hash for different content", () => {
      const hash1 = hashContent("server { handles requests }");
      const hash2 = hashContent("client { sends requests }");
      expect(hash1).not.toBe(hash2);
    });

    test("returns 16-character hash", () => {
      const hash = hashContent("some content");
      expect(hash.length).toBe(16);
    });
  });

  describe("hashContext", () => {
    test("returns consistent hash for same context", () => {
      const context = createMockContext();
      const hash1 = hashContext(context);
      const hash2 = hashContext(context);
      expect(hash1).toBe(hash2);
    });

    test("returns different hash when interfaces change", () => {
      const context1 = createMockContext();
      const context2 = createMockContext({
        interfaces: {
          Handler: { source: "test", definition: "interface Handler {}" },
        },
      });
      expect(hashContext(context1)).not.toBe(hashContext(context2));
    });

    test("returns different hash when constraints change", () => {
      const context1 = createMockContext();
      const context2 = createMockContext({
        constraints: [{ rule: "Must be type-safe", source: "test" }],
      });
      expect(hashContext(context1)).not.toBe(hashContext(context2));
    });

    test("returns different hash when forwarding changes", () => {
      const context1 = createMockContext({ forwarding: { utilities: ["a"] } });
      const context2 = createMockContext({ forwarding: { utilities: ["b"] } });
      expect(hashContext(context1)).not.toBe(hashContext(context2));
    });

    test("order of constraints does not affect hash (sorted)", () => {
      const context1 = createMockContext({
        constraints: [
          { rule: "Rule A", source: "test" },
          { rule: "Rule B", source: "test" },
        ],
      });
      const context2 = createMockContext({
        constraints: [
          { rule: "Rule B", source: "test" },
          { rule: "Rule A", source: "test" },
        ],
      });
      expect(hashContext(context1)).toBe(hashContext(context2));
    });
  });

  describe("addCacheMetadata / extractCacheMetadata", () => {
    test("adds cache metadata to context", () => {
      const context = createMockContext();
      const withCache = addCacheMetadata(context, "spechash", "ctxhash");

      expect(withCache._cache).toBeDefined();
      expect(withCache._cache.specHash).toBe("spechash");
      expect(withCache._cache.parentContextHash).toBe("ctxhash");
      expect(withCache._cache.compiledAt).toBeDefined();
    });

    test("extracts cache metadata from context", () => {
      const context = createMockContext();
      const withCache = addCacheMetadata(context, "spechash", "ctxhash");

      const extracted = extractCacheMetadata(withCache);
      expect(extracted).not.toBeNull();
      expect(extracted!.specHash).toBe("spechash");
      expect(extracted!.parentContextHash).toBe("ctxhash");
    });

    test("returns null for context without cache", () => {
      const context = createMockContext();
      const extracted = extractCacheMetadata(context);
      expect(extracted).toBeNull();
    });
  });

  describe("diffNode", () => {
    test("returns needsRecompile=true when no cache exists", async () => {
      const spec = "server { handles requests }";
      const parentContext = createMockContext();

      const result = await diffNode("server", spec, parentContext, TEST_DIR);

      expect(result.needsRecompile).toBe(true);
      expect(result.reason).toContain("No cached");
    });

    test("returns needsRecompile=true when spec changes", async () => {
      const parentContext = createMockContext();
      const spec1 = "server { old spec }";
      const spec2 = "server { new spec }";

      // Write initial cached files
      await writeAidgFile(TEST_DIR, "server", spec1);
      const context = addCacheMetadata(
        createMockContext(),
        hashContent(spec1),
        hashContext(parentContext)
      );
      await writeAidcFile(TEST_DIR, "server", context);

      // Diff with new spec
      const result = await diffNode("server", spec2, parentContext, TEST_DIR);

      expect(result.needsRecompile).toBe(true);
      expect(result.reason).toContain("Spec content has changed");
    });

    test("returns needsRecompile=true when parent context changes", async () => {
      const spec = "server { same spec }";
      const parentContext1 = createMockContext();
      const parentContext2 = createMockContext({
        constraints: [{ rule: "New constraint", source: "root" }],
      });

      // Write initial cached files
      await writeAidgFile(TEST_DIR, "server", spec);
      const context = addCacheMetadata(
        createMockContext(),
        hashContent(spec),
        hashContext(parentContext1)
      );
      await writeAidcFile(TEST_DIR, "server", context);

      // Diff with new parent context
      const result = await diffNode("server", spec, parentContext2, TEST_DIR);

      expect(result.needsRecompile).toBe(true);
      expect(result.reason).toContain("Parent context has changed");
    });

    test("returns needsRecompile=false when cache is valid", async () => {
      const spec = "server { same spec }";
      const parentContext = createMockContext();

      // Write initial cached files
      await writeAidgFile(TEST_DIR, "server", spec);
      const context = addCacheMetadata(
        createMockContext(),
        hashContent(spec),
        hashContext(parentContext)
      );
      await writeAidcFile(TEST_DIR, "server", context);

      // Diff with same spec and context
      const result = await diffNode("server", spec, parentContext, TEST_DIR);

      expect(result.needsRecompile).toBe(false);
      expect(result.reason).toContain("valid");
      expect(result.cachedContext).toBeDefined();
    });
  });

  describe("summarizeChanges", () => {
    test("reports new node when no old context", () => {
      const newContext = createMockContext();
      const changes = summarizeChanges(null, newContext);

      expect(changes).toContain("New node (no previous compilation)");
    });

    test("reports added interfaces", () => {
      const oldContext = createMockContext();
      const newContext = createMockContext({
        interfaces: {
          Handler: { source: "test", definition: "interface Handler {}" },
        },
      });

      const changes = summarizeChanges(oldContext, newContext);
      expect(changes.some((c) => c.includes("Added interface: Handler"))).toBe(
        true
      );
    });

    test("reports removed interfaces", () => {
      const oldContext = createMockContext({
        interfaces: {
          Handler: { source: "test", definition: "interface Handler {}" },
        },
      });
      const newContext = createMockContext();

      const changes = summarizeChanges(oldContext, newContext);
      expect(
        changes.some((c) => c.includes("Removed interface: Handler"))
      ).toBe(true);
    });

    test("reports added constraints", () => {
      const oldContext = createMockContext();
      const newContext = createMockContext({
        constraints: [{ rule: "Must be type-safe", source: "test" }],
      });

      const changes = summarizeChanges(oldContext, newContext);
      expect(changes.some((c) => c.includes("Added constraint"))).toBe(true);
    });

    test("reports minor changes when no interface/constraint changes", () => {
      const oldContext = createMockContext();
      const newContext = createMockContext();

      const changes = summarizeChanges(oldContext, newContext);
      expect(changes.some((c) => c.includes("Minor changes"))).toBe(true);
    });
  });
});
