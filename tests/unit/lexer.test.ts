import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/parser/lexer.js";
import type { Token, TokenType } from "../../src/types/index.js";

/**
 * Helper to extract just token types and values for easier assertions.
 */
function getTokenPairs(
  source: string,
  filename = "test.aid"
): Array<[TokenType, string]> {
  const result = tokenize(source, filename);
  return result.tokens.map((t) => [t.type, t.value]);
}

/**
 * Helper to extract tokens, excluding whitespace and EOF.
 */
function getSignificantTokens(source: string, filename = "test.aid"): Token[] {
  const result = tokenize(source, filename);
  return result.tokens.filter(
    (t) => t.type !== "whitespace" && t.type !== "eof"
  );
}

describe("Lexer", () => {
  describe("Basic identifiers and braces", () => {
    test("tokenizes simple identifier", () => {
      const result = tokenize("server", "test.aid");
      expect(result.errors).toHaveLength(0);

      const tokens = getSignificantTokens("server");
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe("identifier");
      expect(tokens[0].value).toBe("server");
    });

    test("tokenizes identifier with braces: server { }", () => {
      const tokens = getSignificantTokens("server { }");
      expect(tokens).toHaveLength(3);
      expect(tokens[0]).toMatchObject({ type: "identifier", value: "server" });
      expect(tokens[1]).toMatchObject({ type: "brace_open", value: "{" });
      expect(tokens[2]).toMatchObject({ type: "brace_close", value: "}" });
    });

    test("tokenizes multiple identifiers", () => {
      const tokens = getSignificantTokens("server api auth");
      const identifiers = tokens.filter((t) => t.type === "identifier");
      expect(identifiers).toHaveLength(3);
      expect(identifiers.map((t) => t.value)).toEqual([
        "server",
        "api",
        "auth",
      ]);
    });

    test("tokenizes identifier with underscores", () => {
      const tokens = getSignificantTokens("my_module_name");
      expect(tokens[0]).toMatchObject({
        type: "identifier",
        value: "my_module_name",
      });
    });

    test("tokenizes identifier with numbers (not at start)", () => {
      const tokens = getSignificantTokens("auth2 v3_api");
      const identifiers = tokens.filter((t) => t.type === "identifier");
      expect(identifiers.map((t) => t.value)).toEqual(["auth2", "v3_api"]);
    });
  });

  describe("Tags", () => {
    test("tokenizes .tag { }", () => {
      const tokens = getSignificantTokens(".tag { }");
      expect(tokens[0]).toMatchObject({ type: "dot", value: "." });
      expect(tokens[1]).toMatchObject({ type: "identifier", value: "tag" });
      expect(tokens[2]).toMatchObject({ type: "brace_open", value: "{" });
      expect(tokens[3]).toMatchObject({ type: "brace_close", value: "}" });
    });

    test("tokenizes multiple tags", () => {
      const tokens = getSignificantTokens(".public.readonly");
      expect(tokens).toHaveLength(4);
      expect(tokens[0]).toMatchObject({ type: "dot", value: "." });
      expect(tokens[1]).toMatchObject({ type: "identifier", value: "public" });
      expect(tokens[2]).toMatchObject({ type: "dot", value: "." });
      expect(tokens[3]).toMatchObject({
        type: "identifier",
        value: "readonly",
      });
    });

    test("tokenizes module with tags: server.public { }", () => {
      const tokens = getSignificantTokens("server.public { }");
      expect(tokens[0]).toMatchObject({ type: "identifier", value: "server" });
      expect(tokens[1]).toMatchObject({ type: "dot", value: "." });
      expect(tokens[2]).toMatchObject({ type: "identifier", value: "public" });
      expect(tokens[3]).toMatchObject({ type: "brace_open", value: "{" });
      expect(tokens[4]).toMatchObject({ type: "brace_close", value: "}" });
    });
  });

  describe("Nested blocks", () => {
    test("tokenizes nested braces", () => {
      const source = `server {
  api {
  }
}`;
      const tokens = getSignificantTokens(source);
      const braceOpen = tokens.filter((t) => t.type === "brace_open");
      const braceClose = tokens.filter((t) => t.type === "brace_close");
      expect(braceOpen).toHaveLength(2);
      expect(braceClose).toHaveLength(2);
    });

    test("tokenizes deeply nested structure", () => {
      const source = "a { b { c { } } }";
      const tokens = getSignificantTokens(source);
      const identifiers = tokens.filter((t) => t.type === "identifier");
      expect(identifiers.map((t) => t.value)).toEqual(["a", "b", "c"]);
    });
  });

  describe("Operators", () => {
    test("tokenizes all operator types", () => {
      const tokens = getSignificantTokens(". : * + ~ >");
      const types = tokens.map((t) => t.type);
      expect(types).toContain("dot");
      expect(types).toContain("colon");
      expect(types).toContain("star");
      expect(types).toContain("plus");
      expect(types).toContain("tilde");
      expect(types).toContain("gt");
    });

    test("tokenizes child combinator: parent > child", () => {
      const tokens = getSignificantTokens("parent > child");
      expect(tokens[0]).toMatchObject({ type: "identifier", value: "parent" });
      expect(tokens[1]).toMatchObject({ type: "gt", value: ">" });
      expect(tokens[2]).toMatchObject({ type: "identifier", value: "child" });
    });

    test("tokenizes adjacent sibling combinator: a + b", () => {
      const tokens = getSignificantTokens("a + b");
      expect(tokens[1]).toMatchObject({ type: "plus", value: "+" });
    });

    test("tokenizes general sibling combinator: a ~ b", () => {
      const tokens = getSignificantTokens("a ~ b");
      expect(tokens[1]).toMatchObject({ type: "tilde", value: "~" });
    });

    test("tokenizes universal selector: * { }", () => {
      const tokens = getSignificantTokens("* { }");
      expect(tokens[0]).toMatchObject({ type: "star", value: "*" });
    });

    test("tokenizes pseudo selector: :has()", () => {
      const tokens = getSignificantTokens(":has(x)");
      expect(tokens[0]).toMatchObject({ type: "colon", value: ":" });
      expect(tokens[1]).toMatchObject({ type: "identifier", value: "has" });
      expect(tokens[2]).toMatchObject({ type: "paren_open", value: "(" });
      expect(tokens[3]).toMatchObject({ type: "identifier", value: "x" });
      expect(tokens[4]).toMatchObject({ type: "paren_close", value: ")" });
    });
  });

  describe("Imports", () => {
    test("tokenizes local import: @./file", () => {
      const tokens = getSignificantTokens("@./file");
      expect(tokens[0]).toMatchObject({ type: "import", value: "@./file" });
    });

    test("tokenizes import with extension: @./file.aid", () => {
      const tokens = getSignificantTokens("@./file.aid");
      expect(tokens[0]).toMatchObject({ type: "import", value: "@./file.aid" });
    });

    test("tokenizes URL import: @https://example.com/spec.aid", () => {
      const tokens = getSignificantTokens("@https://example.com/spec.aid");
      expect(tokens[0]).toMatchObject({
        type: "import",
        value: "@https://example.com/spec.aid",
      });
    });

    test("tokenizes parent directory import: @../shared/utils", () => {
      const tokens = getSignificantTokens("@../shared/utils");
      expect(tokens[0]).toMatchObject({
        type: "import",
        value: "@../shared/utils",
      });
    });

    test("import ends at whitespace", () => {
      const tokens = getSignificantTokens("@./file server");
      expect(tokens[0]).toMatchObject({ type: "import", value: "@./file" });
      expect(tokens[1]).toMatchObject({ type: "identifier", value: "server" });
    });

    test("import ends at brace", () => {
      const tokens = getSignificantTokens("@./file{");
      expect(tokens[0]).toMatchObject({ type: "import", value: "@./file" });
      expect(tokens[1]).toMatchObject({ type: "brace_open", value: "{" });
    });
  });

  describe("!important modifier", () => {
    test("tokenizes !important", () => {
      const tokens = getSignificantTokens("!important");
      expect(tokens[0]).toMatchObject({
        type: "important",
        value: "!important",
      });
    });

    test("tokenizes text followed by !important", () => {
      const tokens = getSignificantTokens("Must be secure !important");
      expect(tokens).toContainEqual(
        expect.objectContaining({ type: "important", value: "!important" })
      );
    });

    test("!important in block context", () => {
      const source = "server {\n  critical rule !important\n}";
      const tokens = getSignificantTokens(source);
      expect(tokens).toContainEqual(
        expect.objectContaining({ type: "important", value: "!important" })
      );
    });
  });

  describe("Comments", () => {
    test("tokenizes line comment: // comment", () => {
      const tokens = getSignificantTokens("// this is a comment");
      expect(tokens[0]).toMatchObject({
        type: "comment",
        value: "// this is a comment",
      });
    });

    test("tokenizes block comment: /* comment */", () => {
      const tokens = getSignificantTokens("/* block comment */");
      expect(tokens[0]).toMatchObject({
        type: "comment",
        value: "/* block comment */",
      });
    });

    test("line comment ends at newline", () => {
      const tokens = getSignificantTokens("// comment\nserver");
      expect(tokens[0]).toMatchObject({ type: "comment", value: "// comment" });
      expect(tokens[1]).toMatchObject({ type: "newline", value: "\n" });
      expect(tokens[2]).toMatchObject({ type: "identifier", value: "server" });
    });

    test("block comment can span multiple lines", () => {
      const source = `/* line 1
line 2
line 3 */`;
      const tokens = getSignificantTokens(source);
      expect(tokens[0].type).toBe("comment");
      expect(tokens[0].value).toContain("line 1");
      expect(tokens[0].value).toContain("line 2");
      expect(tokens[0].value).toContain("line 3");
    });

    test("comment between tokens", () => {
      const tokens = getSignificantTokens("server /* comment */ { }");
      expect(tokens[0]).toMatchObject({ type: "identifier", value: "server" });
      expect(tokens[1]).toMatchObject({ type: "comment" });
      expect(tokens[2]).toMatchObject({ type: "brace_open" });
    });
  });

  describe("Code blocks", () => {
    test("tokenizes inline code: `code`", () => {
      const tokens = getSignificantTokens("`const x = 1`");
      expect(tokens[0]).toMatchObject({
        type: "inline_code",
        value: "`const x = 1`",
      });
    });

    test("tokenizes fenced code block", () => {
      const source = "```\nconst x = 1;\nconst y = 2;\n```";
      const tokens = getSignificantTokens(source);
      expect(tokens[0]).toMatchObject({
        type: "code_block",
        value: source,
      });
    });

    test("fenced code block preserves internal content", () => {
      const source = "```typescript\nfunction foo() {\n  return `bar`;\n}\n```";
      const tokens = getSignificantTokens(source);
      expect(tokens[0].type).toBe("code_block");
      // The internal backticks should NOT create separate tokens
      expect(tokens.filter((t) => t.type === "code_block")).toHaveLength(1);
    });

    test("inline code does not parse contents", () => {
      const source = "`{ } . : @ server`";
      const tokens = getSignificantTokens(source);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe("inline_code");
    });

    test("fenced code block does not parse contents", () => {
      const source = "```\nserver { api { } }\n@./import\n!important\n```";
      const tokens = getSignificantTokens(source);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe("code_block");
      expect(tokens[0].value).toBe(source);
    });

    test("code block with language identifier", () => {
      const source = "```json\n{\"key\": \"value\"}\n```";
      const tokens = getSignificantTokens(source);
      expect(tokens[0].type).toBe("code_block");
      expect(tokens[0].value).toContain("json");
    });
  });

  describe("Prose text", () => {
    test("words are tokenized as identifiers at lexer level", () => {
      // At the lexer level, "This is prose" produces identifiers
      // The parser will determine context (prose vs structural)
      const tokens = getSignificantTokens("This is prose text");
      const identifiers = tokens.filter((t) => t.type === "identifier");
      expect(identifiers.map((t) => t.value)).toEqual([
        "This",
        "is",
        "prose",
        "text",
      ]);
    });

    test("prose token for non-identifier text", () => {
      // Prose is for text that can't be an identifier start
      // Once prose starts, it continues until a structural character
      const tokens = getSignificantTokens("123 abc");
      // "123" can't start an identifier, so it becomes prose
      // Space separates it, then "abc" becomes an identifier
      const proseTokens = tokens.filter((t) => t.type === "prose");
      const identifiers = tokens.filter((t) => t.type === "identifier");
      expect(proseTokens.length).toBeGreaterThan(0);
      expect(proseTokens[0].value).toBe("123");
      expect(identifiers).toHaveLength(1);
      expect(identifiers[0].value).toBe("abc");
    });

    test("prose for special characters not handled otherwise", () => {
      // Characters like #, $, %, etc. that aren't structural become prose
      const tokens = getSignificantTokens("#hashtag $var");
      const proseTokens = tokens.filter((t) => t.type === "prose");
      expect(proseTokens.some((t) => t.value.includes("#"))).toBe(true);
      expect(proseTokens.some((t) => t.value.includes("$"))).toBe(true);
    });

    test("prose stops at structural characters", () => {
      const tokens = getSignificantTokens("###test { more }");
      expect(tokens.some((t) => t.type === "prose")).toBe(true);
      expect(tokens.some((t) => t.type === "brace_open")).toBe(true);
    });

    test("text inside braces becomes identifiers", () => {
      // Natural language inside braces will be identifiers at lexer level
      const source = "server {\n  Handle API requests\n}";
      const tokens = getSignificantTokens(source);
      const identifiers = tokens.filter((t) => t.type === "identifier");
      expect(identifiers.map((t) => t.value)).toContain("Handle");
      expect(identifiers.map((t) => t.value)).toContain("API");
      expect(identifiers.map((t) => t.value)).toContain("requests");
    });
  });

  describe("Whitespace and newlines", () => {
    test("tracks newline tokens", () => {
      const result = tokenize("server\napi", "test.aid");
      const newlines = result.tokens.filter((t) => t.type === "newline");
      expect(newlines).toHaveLength(1);
    });

    test("tracks whitespace tokens", () => {
      const result = tokenize("server  api", "test.aid");
      const whitespace = result.tokens.filter((t) => t.type === "whitespace");
      expect(whitespace.length).toBeGreaterThan(0);
    });

    test("includes EOF token", () => {
      const result = tokenize("server", "test.aid");
      const eof = result.tokens.find((t) => t.type === "eof");
      expect(eof).toBeDefined();
    });
  });

  describe("Line/column tracking", () => {
    test("tracks line number correctly", () => {
      const result = tokenize("line1\nline2\nline3", "test.aid");
      const identifiers = result.tokens.filter((t) => t.type === "identifier");

      expect(identifiers[0].location.line).toBe(1);
      expect(identifiers[1].location.line).toBe(2);
      expect(identifiers[2].location.line).toBe(3);
    });

    test("tracks column correctly", () => {
      const result = tokenize("server { }", "test.aid");
      const tokens = result.tokens.filter((t) => t.type !== "whitespace");

      // "server" starts at column 1
      expect(tokens[0].location.column).toBe(1);
      // "{" starts at column 8
      expect(tokens[1].location.column).toBe(8);
    });

    test("resets column after newline", () => {
      const result = tokenize("ab\ncd", "test.aid");
      const identifiers = result.tokens.filter((t) => t.type === "identifier");

      expect(identifiers[0].location).toMatchObject({ line: 1, column: 1 });
      expect(identifiers[1].location).toMatchObject({ line: 2, column: 1 });
    });

    test("tracks offset correctly", () => {
      const result = tokenize("abc def", "test.aid");
      const identifiers = result.tokens.filter((t) => t.type === "identifier");

      expect(identifiers[0].location.offset).toBe(0); // "abc" at position 0
      expect(identifiers[1].location.offset).toBe(4); // "def" at position 4
    });

    test("includes filename in location", () => {
      const result = tokenize("server", "my/path/file.aid");
      expect(result.tokens[0].location.file).toBe("my/path/file.aid");
    });
  });

  describe("Error recovery", () => {
    test("reports error for unclosed block comment", () => {
      const result = tokenize("/* unclosed comment", "test.aid");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Unclosed block comment");
      // Should still produce a token
      expect(result.tokens.some((t) => t.type === "comment")).toBe(true);
    });

    test("reports error for unclosed fenced code block", () => {
      const result = tokenize("```\nunclosed code", "test.aid");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Unclosed fenced code block");
      // Should still produce a token
      expect(result.tokens.some((t) => t.type === "code_block")).toBe(true);
    });

    test("reports error for unclosed inline code", () => {
      const result = tokenize("`unclosed", "test.aid");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Unclosed inline code");
      // Should still produce a token
      expect(result.tokens.some((t) => t.type === "inline_code")).toBe(true);
    });

    test("continues lexing after error", () => {
      const result = tokenize("/* unclosed\nserver { }", "test.aid");
      // Should have an error
      expect(result.errors.length).toBeGreaterThan(0);
      // But should still have found some tokens after the error
      expect(result.tokens.some((t) => t.type === "comment")).toBe(true);
    });

    test("error location is correct", () => {
      const result = tokenize("line1\n/* unclosed", "test.aid");
      expect(result.errors[0].location.line).toBe(2);
      expect(result.errors[0].location.column).toBe(1);
    });
  });

  describe("Complex examples", () => {
    test("tokenizes full module definition", () => {
      const source = `server.public {
  // API server configuration
  Handle HTTP requests
  
  api {
    REST endpoints
  }
}`;
      const result = tokenize(source, "test.aid");
      expect(result.errors).toHaveLength(0);

      const tokens = getSignificantTokens(source);
      expect(tokens.some((t) => t.value === "server")).toBe(true);
      expect(tokens.some((t) => t.value === "api")).toBe(true);
      expect(tokens.some((t) => t.type === "comment")).toBe(true);
    });

    test("tokenizes imports with modules", () => {
      const source = `@./shared/utils
@./shared/types

server {
  Uses shared utilities
}`;
      const result = tokenize(source, "test.aid");
      expect(result.errors).toHaveLength(0);

      const imports = result.tokens.filter((t) => t.type === "import");
      expect(imports).toHaveLength(2);
      expect(imports[0].value).toBe("@./shared/utils");
      expect(imports[1].value).toBe("@./shared/types");
    });

    test("tokenizes pseudo-selectors with arguments", () => {
      const source = ":has(api):not(deprecated) { }";
      const tokens = getSignificantTokens(source);

      const colons = tokens.filter((t) => t.type === "colon");
      const parens = tokens.filter(
        (t) => t.type === "paren_open" || t.type === "paren_close"
      );

      expect(colons).toHaveLength(2);
      expect(parens).toHaveLength(4);
    });

    test("tokenizes code block with constraints", () => {
      const source = `interface {
  \`\`\`typescript
  interface User {
    id: string;
    name: string;
  }
  \`\`\`
  
  !important
}`;
      const result = tokenize(source, "test.aid");
      expect(result.errors).toHaveLength(0);

      expect(result.tokens.some((t) => t.type === "code_block")).toBe(true);
      expect(result.tokens.some((t) => t.type === "important")).toBe(true);
    });
  });

  describe("Edge cases", () => {
    test("empty input", () => {
      const result = tokenize("", "test.aid");
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1); // Just EOF
      expect(result.tokens[0].type).toBe("eof");
    });

    test("only whitespace", () => {
      const result = tokenize("   \t\t  ", "test.aid");
      expect(result.errors).toHaveLength(0);
      const nonEof = result.tokens.filter((t) => t.type !== "eof");
      expect(nonEof.every((t) => t.type === "whitespace")).toBe(true);
    });

    test("only newlines", () => {
      const result = tokenize("\n\n\n", "test.aid");
      expect(result.errors).toHaveLength(0);
      const newlines = result.tokens.filter((t) => t.type === "newline");
      expect(newlines).toHaveLength(3);
    });

    test("consecutive operators", () => {
      const tokens = getSignificantTokens("..::>>++~~");
      expect(tokens.filter((t) => t.type === "dot")).toHaveLength(2);
      expect(tokens.filter((t) => t.type === "colon")).toHaveLength(2);
      expect(tokens.filter((t) => t.type === "gt")).toHaveLength(2);
      expect(tokens.filter((t) => t.type === "plus")).toHaveLength(2);
      expect(tokens.filter((t) => t.type === "tilde")).toHaveLength(2);
    });

    test("identifier-like tokens separated by operators", () => {
      const tokens = getSignificantTokens("a.b:c>d+e~f");
      const identifiers = tokens.filter((t) => t.type === "identifier");
      expect(identifiers.map((t) => t.value)).toEqual([
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
      ]);
    });

    test("@ alone without path", () => {
      const tokens = getSignificantTokens("@ {");
      expect(tokens[0]).toMatchObject({ type: "import", value: "@" });
      expect(tokens[1]).toMatchObject({ type: "brace_open" });
    });

    test("! without important", () => {
      const tokens = getSignificantTokens("!notimportant");
      // Should be treated as prose, not as !important
      expect(tokens[0].type).not.toBe("important");
    });

    test("handles CRLF line endings", () => {
      const result = tokenize("a\r\nb", "test.aid");
      const identifiers = result.tokens.filter((t) => t.type === "identifier");
      expect(identifiers).toHaveLength(2);
      expect(identifiers[0].location.line).toBe(1);
      expect(identifiers[1].location.line).toBe(2);
    });
  });
});
