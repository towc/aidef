/**
 * Lexer Tests
 * 
 * Tests for the nginx-like syntax lexer.
 */

import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/parser/lexer.js";
import type { Token, TokenType } from "../../src/types/index.js";

// Helper to get token types from result
function getTypes(source: string): TokenType[] {
  const { tokens } = tokenize(source, "test.aid");
  return tokens.map(t => t.type);
}

// Helper to get token values from result
function getValues(source: string): string[] {
  const { tokens } = tokenize(source, "test.aid");
  return tokens.map(t => t.value);
}

// Helper to find tokens of a specific type
function findTokens(source: string, type: TokenType): Token[] {
  const { tokens } = tokenize(source, "test.aid");
  return tokens.filter(t => t.type === type);
}

describe("Lexer", () => {
  describe("Basic tokens", () => {
    test("tokenizes identifier", () => {
      const types = getTypes("server");
      expect(types).toContain("identifier");
    });

    test("tokenizes identifier with hyphens", () => {
      const { tokens } = tokenize("email-service", "test.aid");
      expect(tokens[0].type).toBe("identifier");
      expect(tokens[0].value).toBe("email-service");
    });

    test("tokenizes braces", () => {
      const types = getTypes("{ }");
      expect(types).toContain("brace_open");
      expect(types).toContain("brace_close");
    });

    test("tokenizes semicolon", () => {
      const types = getTypes(";");
      expect(types).toContain("semicolon");
    });

    test("tokenizes equals", () => {
      const types = getTypes("=");
      expect(types).toContain("equals");
    });

    test("tokenizes include keyword", () => {
      const types = getTypes("include");
      expect(types).toContain("include");
    });

    test("tokenizes number", () => {
      const { tokens } = tokenize("123", "test.aid");
      expect(tokens[0].type).toBe("number");
      expect(tokens[0].value).toBe("123");
    });

    test("tokenizes decimal number", () => {
      const { tokens } = tokenize("3.14", "test.aid");
      expect(tokens[0].type).toBe("number");
      expect(tokens[0].value).toBe("3.14");
    });
  });

  describe("Strings", () => {
    test("tokenizes simple string", () => {
      const { tokens } = tokenize('"hello"', "test.aid");
      expect(tokens[0].type).toBe("string");
      expect(tokens[0].value).toBe('"hello"');
    });

    test("tokenizes string with escaped quote", () => {
      const { tokens } = tokenize('"say \\"hi\\""', "test.aid");
      expect(tokens[0].type).toBe("string");
      expect(tokens[0].value).toBe('"say \\"hi\\""');
    });

    test("tokenizes multi-line string", () => {
      const { tokens } = tokenize('"line1\nline2"', "test.aid");
      expect(tokens[0].type).toBe("string");
    });

    test("reports unclosed string", () => {
      const { errors } = tokenize('"unclosed', "test.aid");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Unclosed string");
    });
  });

  describe("Comments", () => {
    test("tokenizes line comment", () => {
      const { tokens } = tokenize("// comment", "test.aid");
      expect(tokens[0].type).toBe("comment");
      expect(tokens[0].value).toBe("// comment");
    });

    test("tokenizes block comment", () => {
      const { tokens } = tokenize("/* block */", "test.aid");
      expect(tokens[0].type).toBe("comment");
      expect(tokens[0].value).toBe("/* block */");
    });

    test("tokenizes multi-line block comment", () => {
      const { tokens } = tokenize("/* line1\nline2 */", "test.aid");
      expect(tokens[0].type).toBe("comment");
    });

    test("reports unclosed block comment", () => {
      const { errors } = tokenize("/* unclosed", "test.aid");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Unclosed block comment");
    });
  });

  describe("Code blocks", () => {
    test("tokenizes fenced code block", () => {
      const { tokens } = tokenize("```js\ncode\n```", "test.aid");
      const codeBlock = tokens.find(t => t.type === "code_block");
      expect(codeBlock).toBeDefined();
      expect(codeBlock!.value).toBe("```js\ncode\n```");
    });

    test("tokenizes inline code", () => {
      const { tokens } = tokenize("`code`", "test.aid");
      expect(tokens[0].type).toBe("inline_code");
      expect(tokens[0].value).toBe("`code`");
    });

    test("reports unclosed fenced code block", () => {
      const { errors } = tokenize("```\nunclosed", "test.aid");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Unclosed fenced code block");
    });

    test("reports unclosed inline code", () => {
      const { errors } = tokenize("`unclosed", "test.aid");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Unclosed inline code");
    });
  });

  describe("Whitespace and newlines", () => {
    test("tokenizes whitespace", () => {
      const types = getTypes("  \t");
      expect(types).toContain("whitespace");
    });

    test("tokenizes newlines separately", () => {
      const { tokens } = tokenize("a\nb", "test.aid");
      const newlines = tokens.filter(t => t.type === "newline");
      expect(newlines.length).toBe(1);
    });

    test("handles CRLF", () => {
      const { tokens } = tokenize("a\r\nb", "test.aid");
      // \r becomes whitespace, \n becomes newline
      const identifiers = tokens.filter(t => t.type === "identifier");
      expect(identifiers.length).toBe(2);
    });
  });

  describe("Text (prose)", () => {
    test("tokenizes plain text", () => {
      const { tokens } = tokenize("hello,world!", "test.aid");
      // Punctuation that's not structural becomes text
      expect(tokens.some(t => t.type === "text")).toBe(true);
    });

    test("text stops at structural tokens", () => {
      const { tokens } = tokenize("prose{", "test.aid");
      expect(tokens[0].type).toBe("identifier"); // 'prose' is an identifier
      expect(tokens[1].type).toBe("brace_open");
    });

    test("tokenizes special characters as text", () => {
      const { tokens } = tokenize("foo:bar", "test.aid");
      // 'foo' is identifier, ':bar' is text
      expect(tokens[0].type).toBe("identifier");
    });
  });

  describe("Module block tokenization", () => {
    test("tokenizes simple module", () => {
      const types = getTypes("server { }");
      expect(types).toContain("identifier");
      expect(types).toContain("brace_open");
      expect(types).toContain("brace_close");
    });

    test("tokenizes nested modules", () => {
      const source = `server {
        api {
        }
      }`;
      const { tokens } = tokenize(source, "test.aid");
      const opens = tokens.filter(t => t.type === "brace_open");
      const closes = tokens.filter(t => t.type === "brace_close");
      expect(opens.length).toBe(2);
      expect(closes.length).toBe(2);
    });
  });

  describe("Query filter tokenization", () => {
    test("tokenizes query filter", () => {
      const source = '"is this a database?" { }';
      const types = getTypes(source);
      expect(types).toContain("string");
      expect(types).toContain("brace_open");
      expect(types).toContain("brace_close");
    });
  });

  describe("Parameter tokenization", () => {
    test("tokenizes string parameter", () => {
      const source = 'leaf="single concern";';
      const types = getTypes(source);
      expect(types).toContain("identifier");
      expect(types).toContain("equals");
      expect(types).toContain("string");
      expect(types).toContain("semicolon");
    });

    test("tokenizes number parameter", () => {
      const source = "priority=1;";
      const types = getTypes(source);
      expect(types).toContain("identifier");
      expect(types).toContain("equals");
      expect(types).toContain("number");
      expect(types).toContain("semicolon");
    });
  });

  describe("Include tokenization", () => {
    test("tokenizes include statement", () => {
      const source = "include ./path;";
      const { tokens } = tokenize(source, "test.aid");
      expect(tokens[0].type).toBe("include");
      expect(tokens[0].value).toBe("include");
    });
  });

  describe("Source locations", () => {
    test("tracks line numbers", () => {
      const { tokens } = tokenize("a\nb\nc", "test.aid");
      const identifiers = tokens.filter(t => t.type === "identifier");
      expect(identifiers[0].location.line).toBe(1);
      expect(identifiers[1].location.line).toBe(2);
      expect(identifiers[2].location.line).toBe(3);
    });

    test("tracks column numbers", () => {
      const { tokens } = tokenize("  abc", "test.aid");
      const identifier = tokens.find(t => t.type === "identifier");
      expect(identifier!.location.column).toBe(3);
    });

    test("tracks offset", () => {
      const { tokens } = tokenize("abc def", "test.aid");
      const identifiers = tokens.filter(t => t.type === "identifier");
      expect(identifiers[0].location.offset).toBe(0);
      expect(identifiers[1].location.offset).toBe(4);
    });
  });

  describe("EOF token", () => {
    test("always ends with EOF", () => {
      const { tokens } = tokenize("", "test.aid");
      expect(tokens[tokens.length - 1].type).toBe("eof");
    });

    test("EOF after content", () => {
      const { tokens } = tokenize("hello", "test.aid");
      expect(tokens[tokens.length - 1].type).toBe("eof");
    });
  });

  describe("Complex examples", () => {
    test("tokenizes full module with parameters", () => {
      const source = `
server {
  path="./src";
  leaf="main entry point";
  
  // API routes
  api {
    REST endpoints;
  }
}`;
      const { tokens, errors } = tokenize(source, "test.aid");
      expect(errors).toHaveLength(0);
      
      const strings = tokens.filter(t => t.type === "string");
      const identifiers = tokens.filter(t => t.type === "identifier");
      
      expect(strings.length).toBe(2); // path and leaf values
      expect(identifiers).toContainEqual(expect.objectContaining({ value: "server" }));
      expect(identifiers).toContainEqual(expect.objectContaining({ value: "api" }));
    });

    test("tokenizes query filter with content", () => {
      const source = `
"is this a database module?" {
  Use transactions;
  Handle errors;
}`;
      const { tokens, errors } = tokenize(source, "test.aid");
      expect(errors).toHaveLength(0);
      
      const strings = tokens.filter(t => t.type === "string");
      expect(strings[0].value).toContain("is this a database");
    });
  });
});
